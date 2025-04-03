import logging
import os
from concurrent import futures
from typing import Any, Dict, Optional

from dotenv import load_dotenv, find_dotenv
import grpc
from lmnr import Laminar, LaminarSpanContext
from scrapybara import Scrapybara

# Import the generated gRPC modules
import agent_manager_grpc_pb2 as pb2
import agent_manager_grpc_pb2_grpc as pb2_grpc

from index import Agent, AnthropicProvider, Browser, BrowserConfig
from index.agent.agent import (
    FinalOutputChunk,
    StepChunk,
)
from index.llm.providers.anthropic_bedrock import AnthropicBedrockProvider

# Add logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv(find_dotenv(usecwd=True))

port = os.environ.get("PORT", "8901")
scrapybara = Scrapybara(api_key=os.environ.get("SCRAPYBARA_API_KEY"))

class AgentManagerServicer(pb2_grpc.AgentManagerServiceServicer):
    """Implementation of the AgentManagerService service."""

    async def RunAgent(self, request: pb2.RunAgentRequest, context):
        """Handle a non-streaming agent execution request."""
        logger.info(f"Received RunAgent request: {request}")
        browser_instance = None
        
        try:
            # Start a browser machine instead of accepting CDP URL directly
            browser_instance = scrapybara.start_browser()
            logger.info(f"Started browser machine: {browser_instance.id}")
            cdp_url = browser_instance.get_cdp_url().cdp_url
            logger.info(f"Started browser machine with CDP URL: {cdp_url}")
            
            parent_span_context = None
            if request.parent_span_context:
                parent_span_context = Laminar.deserialize_span_context(request.parent_span_context)
            
            if request.request_api_key:
                Laminar.initialize(project_api_key=request.request_api_key)
            
            # Initialize agent
            agent = self._init_agent(
                cdp_url=cdp_url,
                provider=pb2.ModelProvider.Name(request.model_provider) if request.HasField("model_provider") else "anthropic",
                model=request.model if request.HasField("model") else "claude-3-7-sonnet-20250219",
                enable_thinking=request.enable_thinking if request.HasField("enable_thinking") else True,
                cookies=self._convert_cookies_from_proto(request.cookies) if request.cookies else None
            )
            
            # Run agent
            result = await self._run_agent(
                agent=agent,
                prompt=request.prompt,
                parent_span_context=parent_span_context,
                # previous state is not sent via proto to/from app-server
                agent_state=None,
                # For now, one browser is used per run
                close_context=True,
                session_id=request.session_id
            )
            
            # Convert result to proto response
            response = pb2.AgentOutput(
                result=pb2.ActionResult(
                    is_done=result.get("result", {}).get("is_done", False),
                    content=result.get("result", {}).get("content", ""),
                    error=result.get("result", {}).get("error", ""),
                    give_control=result.get("result", {}).get("give_control", False)
                ),
                trace_id=result.get("trace_id", ""),
                step_count=result.get("step_count", 0)
            )
            
            # Convert cookies
            if "cookies" in result and result["cookies"]:
                for cookie in result["cookies"]:
                    proto_cookie = pb2.Cookie()
                    for key, value in cookie.items():
                        proto_cookie.cookie_data[key] = str(value)
                    response.cookies.append(proto_cookie)
            
            Laminar.shutdown()
            return response
            
        except Exception as e:
            logger.error(f"Error in RunAgent: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            Laminar.shutdown()
            return pb2.AgentOutput()
    
        finally:
            if browser_instance:
                logger.info(f"Stopping browser machine: {browser_instance.id}")
                browser_instance.stop()

    async def RunAgentStream(self, request: pb2.RunAgentRequest, context):
        """Handle a streaming agent execution request."""
        logger.info(f"Received RunAgentStream request: {request}")
        browser_instance = None
        
        try:
            browser_instance = scrapybara.start_browser()
            logger.info(f"Started browser machine: {browser_instance.id}")
            cdp_url = browser_instance.get_cdp_url().cdp_url
            logger.info(f"Started browser machine with CDP URL: {cdp_url}")
            
            parent_span_context = None
            if request.parent_span_context:
                parent_span_context = Laminar.deserialize_span_context(request.parent_span_context)
            
            if request.request_api_key:
                Laminar.initialize(project_api_key=request.request_api_key)
            
            # Initialize agent
            agent = self._init_agent(
                cdp_url=cdp_url,
                provider=pb2.ModelProvider.Name(request.model_provider) if request.HasField("model_provider") else "anthropic",
                model=request.model if request.HasField("model") else "claude-3-7-sonnet-20250219",
                enable_thinking=request.enable_thinking if request.HasField("enable_thinking") else True,
                cookies=self._convert_cookies_from_proto(request.cookies) if request.cookies else None
            )
            
            # Stream agent results
            async for chunk in agent.run_stream(
                prompt=request.prompt,
                max_steps=100,
                parent_span_context=parent_span_context,
                # previous state is not sent via proto to/from app-server
                agent_state=None,
                # For now, one browser is used per run
                close_context=True,
                # continuation from previous request not supported yet
                prev_action_result=None,
                prev_step=None,
                step_span_context=None,
                timeout=None,
                session_id=request.session_id,
                return_screenshots=request.return_screenshots
            ):
                if isinstance(chunk, StepChunk):
                    logger.info(f"Step chunk summary: {chunk.content.summary}")
                    
                    # Create step chunk response
                    response = pb2.RunAgentResponseStreamChunk(
                        step_chunk_content=pb2.StepChunkContent(
                            action_result=pb2.ActionResult(
                                is_done=chunk.content.action_result.is_done,
                                content=chunk.content.action_result.content,
                                error=chunk.content.action_result.error,
                                give_control=chunk.content.action_result.give_control
                            ),
                            summary=chunk.content.summary,
                            trace_id=chunk.content.trace_id,
                            screenshot=chunk.content.screenshot
                        )
                    )
                    yield response
                
                elif isinstance(chunk, FinalOutputChunk):
                    # Create final output response
                    response = pb2.RunAgentResponseStreamChunk(
                        agent_output=pb2.AgentOutput(
                            result=pb2.ActionResult(
                                is_done=chunk.content.result.is_done,
                                content=chunk.content.result.content,
                                error=chunk.content.result.error,
                                give_control=chunk.content.result.give_control
                            ),
                            trace_id=chunk.content.trace_id,
                            step_count=chunk.content.step_count if hasattr(chunk.content, 'step_count') else 0
                        )
                    )
                    
                    # Convert cookies
                    if chunk.content.cookies:
                        for cookie in chunk.content.cookies:
                            proto_cookie = pb2.Cookie()
                            for key, value in cookie.items():
                                proto_cookie.cookie_data[key] = str(value)
                            response.agent_output.cookies.append(proto_cookie)
                    
                    yield response
            
        except Exception as e:
            logger.error(f"Error in RunAgentStream: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
        finally:
            Laminar.shutdown()
            if browser_instance:
                logger.info(f"Stopping browser machine: {browser_instance.id}")
                browser_instance.stop()

    def _init_agent(
        self,
        cdp_url: str,
        provider: str = "anthropic",
        model: str = "claude-3-7-sonnet-20250219",
        enable_thinking: bool = True,
        thinking_token_budget: Optional[int] = 8192,
        cookies: Optional[list[dict[str, Any]]] = None
    ) -> Agent:
        """Initialize the browser agent with the given configuration"""
        
        cv_model_endpoint = os.environ.get("CV_MODEL_ENDPOINT", None)

        browser_config = BrowserConfig(
            cdp_url=cdp_url,
            cookies=cookies,
            cv_model_endpoint=cv_model_endpoint
        )

        browser = Browser(
            config=browser_config,
        )
        
        # Select the appropriate provider
        if provider.lower() == "anthropic":
            llm_provider = AnthropicProvider(model=model, enable_thinking=enable_thinking, thinking_token_budget=thinking_token_budget)
        elif provider.lower() == "bedrock":
            llm_provider = AnthropicBedrockProvider(model=model, enable_thinking=enable_thinking, thinking_token_budget=thinking_token_budget)
        else:
            raise ValueError(f"Unsupported provider: {provider}")

        agent = Agent(
            browser=browser,
            llm=llm_provider,
        )

        return agent

    async def _run_agent(
        self,
        agent: Agent,
        prompt: Optional[str] = None,
        parent_span_context: Optional[LaminarSpanContext] = None,
        agent_state: Optional[str] = None,
        close_context: bool = False,
        session_id: Optional[str] = None,
    ) -> Dict:
        """Run the agent in synchronous mode and return the complete result"""
        # Run agent and get complete result
        output = await agent.run(
            prompt=prompt,
            max_steps=100, 
            parent_span_context=parent_span_context, 
            agent_state=agent_state,
            close_context=close_context,
            session_id=session_id,
        )
        
        return {
            "agent_state": output.agent_state.model_dump_json(),
            "result": output.result.model_dump(),
            "cookies": output.cookies,
            "step_count": output.step_count,
            "trace_id": output.trace_id
        }
    
    def _convert_cookies_from_proto(self, proto_cookies):
        """Convert proto cookies to the format expected by the Browser."""
        cookies = []
        for proto_cookie in proto_cookies:
            cookie_dict = {}
            for key, value in proto_cookie.cookie_data.items():
                cookie_dict[key] = value
            cookies.append(cookie_dict)
        return cookies


async def serve():
    """Start the gRPC server."""
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    pb2_grpc.add_AgentManagerServiceServicer_to_server(
        AgentManagerServicer(), server
    )
    listen_addr = f"0.0.0.0:{port}"
    server.add_insecure_port(listen_addr)
    
    logger.info(f"Starting server on {listen_addr}")
    await server.start()
    
    try:
        await server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Server stopping due to keyboard interrupt...")
        # Use a longer timeout to allow in-progress calls to complete
        await server.stop(5)  # 5 seconds grace period
        logger.info("Server stopped successfully")


if __name__ == "__main__":
    import asyncio
    # Handle signals properly in the main event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(serve())
    finally:
        loop.close()
