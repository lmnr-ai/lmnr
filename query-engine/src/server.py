import logging
import os
import sys
from concurrent import futures

import grpc
from dotenv import load_dotenv, find_dotenv
from google.protobuf.json_format import MessageToDict, ParseDict

sys.path.insert(0, os.path.dirname(__file__))

from query_engine_pb2 import (
    QueryRequest, QueryResponse, ErrorResponse, SuccessResponse,
    JsonToSqlRequest, JsonToSqlResponse, JsonToSqlSuccessResponse,
    SqlToJsonRequest, SqlToJsonResponse, SqlToJsonSuccessResponse,
    QueryStructure
)
from query_engine_pb2_grpc import QueryEngineServiceServicer, add_QueryEngineServiceServicer_to_server

if os.getenv("USE_LEGACY_VALIDATOR", "false").lower().strip() == "true":
    from query_validator import validate_and_secure_query, QueryValidationError
else:
    from query_validator_v2 import validate_and_secure_query, QueryValidationError

from json_to_sql import convert_json_to_sql, QueryBuilderError as JsonToSqlError
from sql_to_json import convert_sql_to_json, QueryBuilderError as SqlToJsonError


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

    def JsonToSql(self, request: JsonToSqlRequest, context):
        try:
            if not request.query_structure or not request.query_structure.table:
                context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
                context.set_details("Query structure with table is required")
                return JsonToSqlResponse(error=ErrorResponse(error="Query structure with table is required"))

            query_dict = MessageToDict(
                request.query_structure,
                preserving_proto_field_name=True,
            )

            sql = convert_json_to_sql(query_dict)

            return JsonToSqlResponse(success=JsonToSqlSuccessResponse(sql=sql))

        except JsonToSqlError as e:
            logger.error(f"Query builder error: {e}")
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details(str(e))
            return JsonToSqlResponse(error=ErrorResponse(error=str(e)))
        except Exception as e:
            logger.error(f"JSON to SQL conversion error: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details("Conversion failed")
            return JsonToSqlResponse(error=ErrorResponse(error=f"Conversion failed: {str(e)}"))

    def SqlToJson(self, request: SqlToJsonRequest, context):
        try:
            if not request.sql:
                context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
                context.set_details("SQL query is required")
                return SqlToJsonResponse(error=ErrorResponse(error="SQL query is required"))

            query_dict = convert_sql_to_json(request.sql)

            query_structure = ParseDict(query_dict, QueryStructure())

            return SqlToJsonResponse(success=SqlToJsonSuccessResponse(query_structure=query_structure))

        except SqlToJsonError as e:
            logger.error(f"Query builder error: {e}")
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details(str(e))
            return SqlToJsonResponse(error=ErrorResponse(error=str(e)))
        except Exception as e:
            logger.error(f"SQL to JSON conversion error: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details("Conversion failed")
            return SqlToJsonResponse(error=ErrorResponse(error=f"Conversion failed: {str(e)}"))


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
