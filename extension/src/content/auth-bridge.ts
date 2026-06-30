// Content scripts run in an isolated JS world but share window message events
// with the main world. We use postMessage for ALL communication — no DOM
// manipulation, no inline scripts — so nothing touches the page's CSP.

interface AuthorizeMessage {
  type: 'radar:authorize';
  token: string;
  apiBaseUrl: string;
  workspaceName?: string;
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data as { type?: string; token?: string; apiBaseUrl?: string; workspaceName?: string };

  // Ping — web app asking "are you there?"
  if (data?.type === 'radar:ping') {
    window.postMessage({ type: 'radar:pong', version: '0.2.0' }, '*');
    return;
  }

  // Authorize — web app sending the token
  if (data?.type === 'radar:authorize') {
    const { token, apiBaseUrl, workspaceName } = data as AuthorizeMessage;
    if (!token || !apiBaseUrl) return;

    chrome.runtime.sendMessage(
      { type: 'radar:authorize', token, apiBaseUrl, workspaceName: workspaceName ?? '' },
      (response: { ok: boolean; error?: string } | undefined) => {
        const reply = chrome.runtime.lastError
          ? { type: 'radar:authorize:reply', ok: false, error: chrome.runtime.lastError.message }
          : { type: 'radar:authorize:reply', ok: response?.ok ?? false, error: response?.error };
        window.postMessage(reply, '*');
      },
    );
  }
});
