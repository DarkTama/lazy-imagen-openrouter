//! Provider API keys in the OS keyring. `get` is Rust-internal only; JS can
//! set/has/remove but never read a key back.

pub const IDENTIFIER: &str = "io.github.darktama.lazyimagen";

pub(crate) trait SecretStore {
    fn get(&self, id: &str) -> Result<Option<String>, String>;
    fn set(&self, id: &str, key: &str) -> Result<(), String>;
    fn delete(&self, id: &str) -> Result<(), String>;
}

pub(crate) struct KeyringStore;

impl KeyringStore {
    fn entry(id: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(IDENTIFIER, &format!("provider:{id}"))
            .map_err(|e| format!("OS keychain unavailable: {e}"))
    }
}

impl SecretStore for KeyringStore {
    fn get(&self, id: &str) -> Result<Option<String>, String> {
        match Self::entry(id)?.get_password() {
            Ok(s) => Ok(Some(s)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("OS keychain read failed: {e}")),
        }
    }
    fn set(&self, id: &str, key: &str) -> Result<(), String> {
        Self::entry(id)?
            .set_password(key)
            .map_err(|e| format!("OS keychain write failed: {e}"))
    }
    fn delete(&self, id: &str) -> Result<(), String> {
        match Self::entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("OS keychain delete failed: {e}")),
        }
    }
}

pub(crate) fn validate_provider_id(id: &str) -> Result<(), String> {
    let ok = (1..=128).contains(&id.len())
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'));
    if ok { Ok(()) } else { Err("invalid provider id".into()) }
}

fn set_in(s: &dyn SecretStore, id: &str, key: &str) -> Result<(), String> {
    validate_provider_id(id)?;
    if key.is_empty() {
        return Err("empty key".into());
    }
    s.set(id, key)
}

fn has_in(s: &dyn SecretStore, id: &str) -> Result<bool, String> {
    validate_provider_id(id)?;
    Ok(s.get(id)?.is_some_and(|k| !k.is_empty()))
}

fn remove_in(s: &dyn SecretStore, id: &str) -> Result<(), String> {
    validate_provider_id(id)?;
    s.delete(id)
}

/// Rust-internal key read (used by request code); not a command.
#[allow(dead_code)]
pub(crate) fn get(id: &str) -> Result<Option<String>, String> {
    validate_provider_id(id)?;
    KeyringStore.get(id)
}

#[tauri::command]
pub fn key_set(provider_id: String, key: String) -> Result<(), String> {
    set_in(&KeyringStore, &provider_id, &key)
}

#[tauri::command]
pub fn key_has(provider_id: String) -> Result<bool, String> {
    has_in(&KeyringStore, &provider_id)
}

#[tauri::command]
pub fn key_remove(provider_id: String) -> Result<(), String> {
    remove_in(&KeyringStore, &provider_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    #[derive(Default)]
    struct MemStore(RefCell<HashMap<String, String>>);

    impl SecretStore for MemStore {
        fn get(&self, id: &str) -> Result<Option<String>, String> {
            Ok(self.0.borrow().get(id).cloned())
        }
        fn set(&self, id: &str, key: &str) -> Result<(), String> {
            self.0.borrow_mut().insert(id.into(), key.into());
            Ok(())
        }
        fn delete(&self, id: &str) -> Result<(), String> {
            self.0.borrow_mut().remove(id);
            Ok(())
        }
    }

    #[test]
    fn set_has_remove_roundtrip() {
        let s = MemStore::default();
        assert!(!has_in(&s, "openrouter").unwrap());
        set_in(&s, "openrouter", "sk-1").unwrap();
        assert!(has_in(&s, "openrouter").unwrap());
        assert_eq!(s.get("openrouter").unwrap().as_deref(), Some("sk-1"));
        remove_in(&s, "openrouter").unwrap();
        assert!(!has_in(&s, "openrouter").unwrap());
    }

    #[test]
    fn remove_missing_ok() {
        assert!(remove_in(&MemStore::default(), "nope").is_ok());
    }

    #[test]
    fn providers_isolated() {
        let s = MemStore::default();
        set_in(&s, "a", "1").unwrap();
        assert!(!has_in(&s, "b").unwrap());
    }

    #[test]
    fn empty_key_rejected() {
        assert!(set_in(&MemStore::default(), "a", "").is_err());
    }

    #[test]
    fn id_validation() {
        assert!(validate_provider_id("custom_1728000000000_abcde").is_ok());
        assert!(validate_provider_id("a.b-c_D9").is_ok());
        assert!(validate_provider_id(&"a".repeat(128)).is_ok());
        assert!(validate_provider_id(&"a".repeat(129)).is_err());
        for bad in ["", "a b", "a/b", "a:b", "../x", "é", "a\n"] {
            assert!(validate_provider_id(bad).is_err(), "{bad:?}");
        }
        let s = MemStore::default();
        assert!(set_in(&s, "bad id", "k").is_err());
        assert!(has_in(&s, "").is_err());
        assert!(remove_in(&s, "a/b").is_err());
    }
}
