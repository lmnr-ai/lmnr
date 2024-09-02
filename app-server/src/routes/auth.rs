use actix_web::{post, web, HttpResponse};
use log::info;
use serde::{Deserialize, Serialize};

use crate::{
    db::{
        self,
        user::{get_api_key_for_user_from_email, write_api_key, write_user, ApiKey, User},
        utils::generate_random_key,
        workspace::Workspace,
        DB,
    },
    routes::ResponseResult,
};

#[derive(Debug, Deserialize)]
struct SignInParams {
    name: String,
    email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SignInResponse {
    api_key: String,
    is_new_user_created: bool,
}

#[post("signin")]
async fn signin(params: web::Json<SignInParams>, db: web::Data<DB>) -> ResponseResult {
    let params = params.into_inner();
    let email = params.email;
    let name = params.name;

    if let Some(api_key) = get_api_key_for_user_from_email(&db.pool, &email).await {
        let res = SignInResponse {
            api_key,
            is_new_user_created: false,
        };
        return Ok(HttpResponse::Ok().json(res));
    }

    let user_id = uuid::Uuid::new_v4();
    let user = User {
        id: user_id,
        name: name.to_owned(),
        email,
        ..Default::default()
    };

    info!("Creating new user: {:?}", user);

    let api_key = ApiKey {
        api_key: generate_random_key(),
        user_id,
        name: String::from("default"),
    };

    // TODO: Validate email before creating user
    write_user(&db.pool, &user.id, &user.email, &user.name).await?;
    write_api_key(&db.pool, &api_key.api_key, &api_key.user_id, &api_key.name).await?;

    // create new workspace for user
    let workspace = Workspace {
        id: uuid::Uuid::new_v4(),
        name: format!("{}'s workspace", name),
    };
    db::workspace::create_new_workspace(&db.pool, &workspace).await?;
    info!("Created new workspace: {:?}", workspace);
    db::workspace::add_owner_to_workspace(&db.pool, &user_id, &workspace.id).await?;
    info!("Added user to workspace: {:?}", workspace);

    let res = SignInResponse {
        api_key: api_key.api_key,
        is_new_user_created: true,
    };
    Ok(HttpResponse::Ok().json(res))
}
