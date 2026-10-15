use keyring_core::{Entry, Error};
use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};

const SERVICE: &str = "com.solvia.desktop";
const REFRESH_TOKEN_ACCOUNT: &str = "refresh-token";

fn refresh_token_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, REFRESH_TOKEN_ACCOUNT).map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_refresh_token(token: String) -> Result<(), String> {
    refresh_token_entry()?
        .set_password(&token)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn load_refresh_token() -> Result<Option<String>, String> {
    match refresh_token_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
async fn clear_refresh_token() -> Result<(), String> {
    match refresh_token_entry()?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn install_native_store() -> keyring_core::Result<()> {
    #[cfg(target_os = "macos")]
    keyring_core::set_default_store(apple_native_keyring_store::keychain::Store::new()?);
    #[cfg(target_os = "windows")]
    keyring_core::set_default_store(windows_native_keyring_store::Store::new()?);
    #[cfg(target_os = "linux")]
    keyring_core::set_default_store(dbus_secret_service_keyring_store::Store::new()?);
    Ok(())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("secure-store")
        .invoke_handler(tauri::generate_handler![
            save_refresh_token,
            load_refresh_token,
            clear_refresh_token
        ])
        .setup(|_app, _api| {
            install_native_store()?;
            Ok(())
        })
        .on_drop(|_app| {
            keyring_core::unset_default_store();
        })
        .build()
}
