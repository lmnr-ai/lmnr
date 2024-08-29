use actix_web::HttpResponse;

use super::error::Error;

pub type ResponseResult = std::result::Result<HttpResponse, Error>;
