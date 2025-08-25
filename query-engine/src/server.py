import logging
import os
import sys
from concurrent import futures

# Add parent directory to path if running directly (not as module)
if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import grpc
from dotenv import load_dotenv, find_dotenv

from src.query_engine_pb2 import QueryRequest, QueryResponse, ErrorResponse, SuccessResponse
from src.query_engine_pb2_grpc import QueryEngineServiceServicer, add_QueryEngineServiceServicer_to_server
from src.query_validator import validate_and_secure_query, QueryValidationError


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv(find_dotenv(usecwd=True))
port = os.environ.get("PORT", "8903")


class QueryEngineServicer(QueryEngineServiceServicer):
    
    def ValidateQuery(self, request: QueryRequest, context):
        try:
            if not request.query:
                context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
                context.set_details("Query is required")
                return QueryResponse(error=ErrorResponse(error="Query is required"))
            
            if not request.project_id:
                context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
                context.set_details("Project ID is required")
                return QueryResponse(error=ErrorResponse(error="Project ID is required"))

            secured_query = validate_and_secure_query(request.query, request.project_id)
            
            return QueryResponse(
                success=SuccessResponse(query=secured_query)
            )
            
        except QueryValidationError as e:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details(str(e))
            return QueryResponse(error=ErrorResponse(error=str(e)))
        except Exception as e:
            logger.error(f"Query validation error: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details("Query validation failed")
            return QueryResponse(error=ErrorResponse(error="Query validation failed"))

async def serve():
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    add_QueryEngineServiceServicer_to_server(QueryEngineServicer(), server)
    listen_addr = f"0.0.0.0:{port}"
    server.add_insecure_port(listen_addr)
    
    logger.info(f"Starting server on {listen_addr}")
    await server.start()
    
    try:
        await server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Server stopping...")
        await server.stop(5)

if __name__ == "__main__":
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(serve())
    finally:
        loop.close()