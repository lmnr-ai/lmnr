use crate::db::project_api_keys::ProjectApiKey;
use crate::db::{self, DB};
use crate::machine_manager::{
    ComputerActionCoordinate as MachineManagerComputerActionCoordinate,
    ComputerActionRequest as MachineManagerComputerActionRequest,
};
use crate::{
    machine_manager::{MachineManager, MachineManagerTrait},
    routes::types::ResponseResult,
};
use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use futures_util::{SinkExt, StreamExt};
use log::{error, info};
use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use std::env;
use std::sync::Arc;
use uuid::Uuid;

#[post("machine/start")]
pub async fn start_machine(
    machine_manager: web::Data<Arc<MachineManager>>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let machine_id = machine_manager.start_machine().await?;

    db::machine_manager::create_machine(&db.pool, machine_id, project_id).await?;

    Ok(HttpResponse::Ok().json(json!({ "machine_id": machine_id })))
}

#[derive(Deserialize)]
struct TerminateMachineRequest {
    machine_id: Uuid,
}

#[post("machine/terminate")]
pub async fn terminate_machine(
    machine_manager: web::Data<Arc<MachineManager>>,
    request: web::Json<TerminateMachineRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    let request = request.into_inner();
    let project_id = project_api_key.project_id;
    machine_manager
        .terminate_machine(request.machine_id)
        .await?;

    db::machine_manager::delete_machine(&db.pool, request.machine_id, project_id).await?;
    Ok(HttpResponse::Ok().json(json!({ "success": true })))
}

#[derive(Deserialize)]
enum ComputerAction {
    Key = 0,
    Type = 1,
    MouseMove = 2,
    LeftClick = 3,
    LeftClickDrag = 4,
    RightClick = 5,
    MiddleClick = 6,
    DoubleClick = 7,
    Screenshot = 8,
    CursorPosition = 9,
}

#[derive(Deserialize)]
struct Coordinates {
    x: u32,
    y: u32,
}

#[derive(Deserialize)]
struct ComputerActionRequest {
    action: ComputerAction,
    coordinates: Option<Coordinates>,
    text: Option<String>,
    machine_id: String,
}

#[derive(Serialize)]
struct ComputerActionResponse {
    output: Option<String>,
    error: Option<String>,
    base64_image: Option<String>,
    system: Option<String>,
}

#[post("machine/computer_action")]
pub async fn execute_computer_action(
    machine_manager: web::Data<Arc<MachineManager>>,
    request: web::Json<ComputerActionRequest>,
) -> ResponseResult {
    let request = request.into_inner();

    let coordinates = if let Some(coordinates) = request.coordinates {
        Some(MachineManagerComputerActionCoordinate {
            x: coordinates.x as i32,
            y: coordinates.y as i32,
        })
    } else {
        None
    };

    let computer_action_request = MachineManagerComputerActionRequest {
        action: request.action as i32,
        coordinates,
        text: request.text,
        machine_id: request.machine_id,
    };

    let response = machine_manager
        .execute_computer_action(computer_action_request)
        .await?;

    let response = ComputerActionResponse {
        output: response.output,
        error: response.error,
        base64_image: response.base64_image,
        system: response.system,
    };

    Ok(HttpResponse::Ok().json(response))
}

#[get("v1/machine/vnc_stream/{machine_id}")]
pub async fn vnc_stream(
    machine_id: web::Path<String>,
    body: web::Payload,
    req: HttpRequest,
) -> actix_web::Result<impl Responder> {
    let machine_id = machine_id.into_inner();
    // Set up WebSocket connection
    let (response, mut client_session, mut client_msg_stream) = actix_ws::handle(&req, body)?;

    let machine_manager_url_ws =
        env::var("MACHINE_MANAGER_URL_WS").expect("MACHINE_MANAGER_URL_WS is not set");
    // Connect to VNC machine
    let machine_url = format!("{}/{}", machine_manager_url_ws, machine_id);

    let (machine_ws_stream, _) = match tokio_tungstenite::connect_async(&machine_url).await {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to VNC machine at {}: {}", machine_url, e);
            return Ok(actix_web::HttpResponse::ServiceUnavailable().finish());
        }
    };

    let (mut machine_write, mut machine_read) = machine_ws_stream.split();

    // Forward machine messages to client
    actix_web::rt::spawn(async move {
        info!("Starting machine to client forwarding task");
        while let Some(Ok(msg)) = machine_read.next().await {
            match msg {
                tokio_tungstenite::tungstenite::Message::Text(text) => {
                    if let Err(e) = client_session.text(text.to_string()).await {
                        error!("Error forwarding text message to client: {}", e);
                        break;
                    }
                }
                tokio_tungstenite::tungstenite::Message::Binary(bytes) => {
                    if let Err(e) = client_session.binary(bytes).await {
                        error!("Error forwarding binary message to client: {}", e);
                        break;
                    }
                }
                tokio_tungstenite::tungstenite::Message::Ping(bytes) => {
                    if let Err(e) = client_session.pong(&bytes).await {
                        error!("Error sending pong to client: {}", e);
                        break;
                    }
                }
                tokio_tungstenite::tungstenite::Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Forward client messages to machine
    actix_web::rt::spawn(async move {
        info!("Starting client to machine forwarding task");
        while let Some(Ok(msg)) = client_msg_stream.next().await {
            let machine_msg = match msg {
                actix_ws::Message::Text(text) => {
                    tokio_tungstenite::tungstenite::Message::Text(text.to_string().into())
                }
                actix_ws::Message::Binary(bytes) => {
                    tokio_tungstenite::tungstenite::Message::Binary(bytes.to_vec())
                }
                actix_ws::Message::Ping(bytes) => {
                    tokio_tungstenite::tungstenite::Message::Ping(bytes.to_vec())
                }
                actix_ws::Message::Close(_) => tokio_tungstenite::tungstenite::Message::Close(None),
                _ => continue,
            };

            if let Err(e) = machine_write.send(machine_msg).await {
                error!("Error forwarding message to machine: {}", e);
                break;
            }
        }
    });

    Ok(response)
}
