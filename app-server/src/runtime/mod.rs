use std::cmp::max;
use std::io;
use std::sync::atomic::{AtomicUsize, Ordering};

use tokio::runtime;
use tokio::runtime::Runtime;

pub fn create_general_purpose_runtime() -> io::Result<Runtime> {
    runtime::Builder::new_multi_thread()
        .enable_time()
        .enable_io()
        .worker_threads(max(num_cpus::get(), 2))
        .thread_name_fn(|| {
            static ATOMIC_ID: AtomicUsize = AtomicUsize::new(0);
            let general_id = ATOMIC_ID.fetch_add(1, Ordering::SeqCst);
            format!("general-{general_id}")
        })
        .build()
}

#[cfg(not(unix))]
pub async fn wait_stop_signal(for_what: &str) {
    signal::ctrl_c().await.unwrap();
    log::debug!("Stopping {for_what} on SIGINT");
}

#[cfg(unix)]
pub async fn wait_stop_signal(for_what: &str) {
    use tokio::signal;

    let mut term = signal::unix::signal(signal::unix::SignalKind::terminate()).unwrap();
    let mut inrt = signal::unix::signal(signal::unix::SignalKind::interrupt()).unwrap();

    tokio::select! {
        _ = term.recv() => log::debug!("Stopping {for_what} on SIGTERM"),
        _ = inrt.recv() => log::debug!("Stopping {for_what} on SIGINT"),
    }
}
