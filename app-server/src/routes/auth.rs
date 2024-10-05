use actix_web::{post, web, HttpResponse};
use anyhow::Result;
use log::info;
use serde::{Deserialize, Serialize};

use crate::{
    db::{
        user::{get_api_key_for_user_from_email, write_api_key, write_user, ApiKey, User},
        utils::generate_random_key,
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
    validate_user_email(&user.email)?;

    write_user(&db.pool, &user.id, &user.email, &user.name).await?;
    write_api_key(&db.pool, &api_key.api_key, &api_key.user_id, &api_key.name).await?;

    let res = SignInResponse {
        api_key: api_key.api_key,
        is_new_user_created: true,
    };

    Ok(HttpResponse::Ok().json(res))
}

fn validate_user_email(email: &str) -> Result<()> {
    let email_regex =
        regex::Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    if !email_regex.is_match(email) {
        return Err(anyhow::anyhow!("Invalid email format"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_user_email_valid() {
        assert!(validate_user_email("user@example.com").is_ok());
        assert!(validate_user_email("user.name+tag@example.co.uk").is_ok());
        assert!(validate_user_email("user123@subdomain.example.com").is_ok());
    }

    #[test]
    fn test_validate_user_email_invalid() {
        assert!(validate_user_email("").is_err());
        assert!(validate_user_email("smth").is_err());
        assert!(validate_user_email("user@").is_err());
        assert!(validate_user_email("user@.com").is_err());
        assert!(validate_user_email("@example.com").is_err());
        assert!(validate_user_email("user@example").is_err());
        assert!(validate_user_email("user@exam ple.com").is_err());
    }

    #[test]
    fn test_validate_user_email_edge_cases() {
        assert!(validate_user_email("a@b.co").is_ok());
        assert!(validate_user_email("user+tag@example.museum").is_ok());
        assert!(validate_user_email("user@123.456.789.0").is_err());
    }
}
