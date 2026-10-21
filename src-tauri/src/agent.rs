use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Clone)]
pub struct AgentState {
    is_paused: Arc<AtomicBool>,
    is_quitting: Arc<AtomicBool>,
}

impl Default for AgentState {
    fn default() -> Self {
        Self {
            is_paused: Arc::new(AtomicBool::new(false)),
            is_quitting: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl AgentState {
    pub fn new() -> Self {
        Self::default()
    }

    #[allow(dead_code)]
    pub fn is_paused(&self) -> bool {
        self.is_paused.load(Ordering::SeqCst)
    }

    #[allow(dead_code)]
    pub fn set_paused(&self, paused: bool) {
        self.is_paused.store(paused, Ordering::SeqCst);
        tracing::info!("Agent protection pause state set to: {paused}");
    }

    pub fn toggle_paused(&self) -> bool {
        let current = self.is_paused.load(Ordering::SeqCst);
        let next = !current;
        self.is_paused.store(next, Ordering::SeqCst);
        tracing::info!("Agent protection pause state toggled to: {next}");
        next
    }

    pub fn is_quitting(&self) -> bool {
        self.is_quitting.load(Ordering::SeqCst)
    }

    pub fn set_quitting(&self, quitting: bool) {
        self.is_quitting.store(quitting, Ordering::SeqCst);
        tracing::info!("Agent quitting state set to: {quitting}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_pause_lifecycle() {
        let agent = AgentState::new();
        assert!(!agent.is_paused());

        agent.set_paused(true);
        assert!(agent.is_paused());

        let toggled = agent.toggle_paused();
        assert!(!toggled);
        assert!(!agent.is_paused());
    }
}
