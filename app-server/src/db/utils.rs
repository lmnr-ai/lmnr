use rand::distr::{Alphanumeric, SampleString};
use uuid::Uuid;

pub fn generate_random_key() -> String {
    Alphanumeric.sample_string(&mut rand::rng(), 64)
}

pub fn span_id_to_uuid(span_id: &[u8]) -> Uuid {
    let mut padded_vec = vec![0; 8];
    padded_vec.extend_from_slice(&span_id.to_vec());
    Uuid::from_slice(&padded_vec).unwrap()
}
