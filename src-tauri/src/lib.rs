mod http;
mod keys;

pub fn run() {
    tauri::Builder::default()
        .manage(http::build_client().expect("http client"))
        .invoke_handler(tauri::generate_handler![
            keys::key_set,
            keys::key_has,
            keys::key_remove,
            http::provider_fetch
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lazy Imagen");
}
