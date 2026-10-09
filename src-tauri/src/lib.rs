mod keys;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            keys::key_set,
            keys::key_has,
            keys::key_remove
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lazy Imagen");
}
