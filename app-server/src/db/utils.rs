use rand::distributions::{Alphanumeric, DistString};

pub fn generate_random_key() -> String {
    Alphanumeric.sample_string(&mut rand::thread_rng(), 64)
}
