package local.aihub.mobile;

import android.app.*;
import android.content.*;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslCertificate;
import android.net.http.SslError;
import android.os.*;
import android.text.InputType;
import android.util.TypedValue;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.*;

public class MainActivity extends Activity {
  private static final int BG_BLACK = 0xFF08080A;
  private static final int GLASS_PANEL = 0xFF121217;
  private static final int GLASS_USER = 0xFF1B1B23;
  private static final int GLASS_BORDER = 0xFF272731;
  private static final int TEXT_MAIN = 0xFFF4F4F5;
  private static final int TEXT_MUTED = 0xFF8E8E96;
  private static final int GREEN_DOT = 0xFF22C55E;

  private final ExecutorService io = Executors.newCachedThreadPool();
  private LinearLayout root;
  private LinearLayout bodyFrame;
  private ScrollView chatScroll;
  private LinearLayout chatMessagesView;
  private TextView statusBadge;
  private EditText promptInput;
  private Button sendBtn;
  private WebView web;
  private ValueCallback<Uri[]> files;
  private EditText pairInput;

  private String origin = "";
  private String pin = "";
  private String sessionCookie = "";
  private final List<String> candidates = new ArrayList<>();

  private String currentTab = "chat"; // "chat" | "studio" | "pair"
  private String selectedProvider = "openai";
  private String selectedModel = "gpt-6-astra";
  private String openaiDefaultModel = "gpt-6-astra";
  private String geminiDefaultModel = "gemini-4-argon-medium";
  private String grokDefaultModel = "grok-4";
  private String activeChatId = "";
  private boolean workMode = false;
  private String workDir = "";
  private volatile boolean busy = false;
  private final List<JSONObject> currentMessages = new ArrayList<>();

  private int dp(int n) {
    return (int) (n * getResources().getDisplayMetrics().density);
  }

  private GradientDrawable box(int fill, int stroke, int radiusDp) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(fill);
    d.setCornerRadius(dp(radiusDp));
    if (stroke != 0) d.setStroke(dp(1), stroke);
    return d;
  }

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    WebView.setWebContentsDebuggingEnabled(false);
    getWindow().setStatusBarColor(BG_BLACK);
    getWindow().setNavigationBarColor(BG_BLACK);
    loadPrefs();
    String incoming = extractPairCode(getIntent());
    if (incoming != null) {
      renderShell("pair");
      acceptPairCode(incoming);
    } else if (!origin.isEmpty() && !pin.isEmpty()) {
      renderShell("chat");
      reconnectAndBootstrap(null);
    } else {
      renderShell("pair");
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    String incoming = extractPairCode(intent);
    if (incoming != null) acceptPairCode(incoming);
  }

  private void loadPrefs() {
    SharedPreferences p = getPreferences(0);
    origin = p.getString("origin", "");
    pin = p.getString("pin", "");
    sessionCookie = p.getString("cookie", "");
    workDir = p.getString("workDir", "");
    candidates.clear();
    String raw = p.getString("candidates", "");
    if (!raw.isEmpty()) {
      for (String item : raw.split(",")) {
        String trimmed = item.trim();
        if (!trimmed.isEmpty() && !candidates.contains(trimmed)) candidates.add(trimmed);
      }
    }
    if (!origin.isEmpty() && !candidates.contains(origin)) candidates.add(0, origin);
  }

  private void savePrefs() {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < candidates.size(); i++) {
      if (i > 0) sb.append(",");
      sb.append(candidates.get(i));
    }
    getPreferences(0)
        .edit()
        .putString("origin", origin)
        .putString("pin", pin)
        .putString("cookie", sessionCookie)
        .putString("workDir", workDir)
        .putString("candidates", sb.toString())
        .apply();
  }

  private String extractPairCode(Intent i) {
    if (i == null) return null;
    if (i.getData() != null && "aihub".equals(i.getData().getScheme())) {
      return i.getData().toString();
    }
    if (Intent.ACTION_SEND.equals(i.getAction())) {
      String extra = i.getStringExtra(Intent.EXTRA_TEXT);
      if (extra != null && extra.contains("aihub://pair")) {
        int idx = extra.indexOf("aihub://pair");
        return extra.substring(idx).split("\\s+")[0];
      }
    }
    return null;
  }

  private boolean allowedHost(String host) {
    if (host == null || !host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) return false;
    String[] parts = host.split("\\.");
    int[] p = new int[4];
    for (int i = 0; i < 4; i++) {
      p[i] = Integer.parseInt(parts[i]);
      if (p[i] > 255) return false;
    }
    return p[0] == 10
        || (p[0] == 192 && p[1] == 168)
        || (p[0] == 172 && p[1] >= 16 && p[1] <= 31)
        || (p[0] == 100 && p[1] >= 64 && p[1] <= 127);
  }

  private boolean isTailscaleUrl(String u) {
    try {
      String h = Uri.parse(u).getHost();
      return h != null && h.startsWith("100.");
    } catch (Exception e) {
      return false;
    }
  }

  private String formatOriginLabel(String u) {
    if (u == null || u.isEmpty()) return "Не подключено";
    try {
      String h = Uri.parse(u).getHost();
      return (h != null && h.startsWith("100.") ? "● Tailscale · " : "● Wi-Fi · ") + h;
    } catch (Exception e) {
      return u;
    }
  }

  private SSLSocketFactory pinnedSocketFactory() throws Exception {
    TrustManager[] tm = new TrustManager[] {
      new X509TrustManager() {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {}

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
          if (chain == null || chain.length == 0 || pin.isEmpty()) {
            throw new CertificateException("Missing certificate or pin");
          }
          try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded());
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b & 255));
            if (!MessageDigest.isEqual(
                hex.toString().getBytes(StandardCharsets.US_ASCII),
                pin.getBytes(StandardCharsets.US_ASCII))) {
              throw new CertificateException("Certificate pin mismatch");
            }
          } catch (CertificateException ce) {
            throw ce;
          } catch (Exception e) {
            throw new CertificateException("Pin check failed", e);
          }
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
          return new X509Certificate[0];
        }
      }
    };
    SSLContext ctx = SSLContext.getInstance("TLS");
    ctx.init(null, tm, new SecureRandom());
    return ctx.getSocketFactory();
  }

  private HttpsURLConnection openPinnedConnection(String baseUrl, String path, String method, int timeoutMs) throws Exception {
    Uri base = Uri.parse(baseUrl);
    if (base.getHost() == null || !"https".equals(base.getScheme()) || base.getPort() != 3443 || !allowedHost(base.getHost())) {
      throw new IOException("Недопустимый адрес сервера");
    }
    URL url = new URL(baseUrl + path);
    HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
    conn.setSSLSocketFactory(pinnedSocketFactory());
    conn.setHostnameVerifier((hostname, session) -> {
      try {
        Certificate[] certs = session.getPeerCertificates();
        if (certs.length == 0) return false;
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(certs[0].getEncoded());
        StringBuilder hex = new StringBuilder();
        for (byte b : digest) hex.append(String.format("%02x", b & 255));
        return allowedHost(hostname)
            && MessageDigest.isEqual(
                hex.toString().getBytes(StandardCharsets.US_ASCII),
                pin.getBytes(StandardCharsets.US_ASCII));
      } catch (Exception e) {
        return false;
      }
    });
    conn.setInstanceFollowRedirects(false);
    conn.setConnectTimeout(timeoutMs);
    conn.setReadTimeout(Math.max(timeoutMs, 90000));
    conn.setRequestMethod(method);
    conn.setRequestProperty("Origin", baseUrl);
    if (!sessionCookie.isEmpty()) {
      conn.setRequestProperty("Cookie", sessionCookie);
    }
    return conn;
  }

  private void captureCookies(HttpsURLConnection conn) {
    Map<String, List<String>> headers = conn.getHeaderFields();
    if (headers == null) return;
    for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
      if (entry.getKey() != null && entry.getKey().equalsIgnoreCase("Set-Cookie")) {
        for (String c : entry.getValue()) {
          if (c.startsWith("aihub_session=")) {
            sessionCookie = c.split(";")[0].trim();
            savePrefs();
            syncCookieToWebView();
          }
        }
      }
    }
  }

  private void syncCookieToWebView() {
    if (sessionCookie.isEmpty() || origin.isEmpty()) return;
    try {
      CookieManager cm = CookieManager.getInstance();
      cm.setAcceptCookie(true);
      cm.setCookie(origin, sessionCookie + "; Path=/; Secure; HttpOnly; SameSite=Strict");
      for (String cand : candidates) {
        cm.setCookie(cand, sessionCookie + "; Path=/; Secure; HttpOnly; SameSite=Strict");
      }
      cm.flush();
    } catch (Exception ignored) {}
  }

  private String readStream(InputStream in) throws IOException {
    if (in == null) return "";
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[4096];
    int n;
    while ((n = in.read(buf)) != -1) {
      if (out.size() + n > 4_000_000) throw new IOException("Ответ слишком большой");
      out.write(buf, 0, n);
    }
    return new String(out.toByteArray(), StandardCharsets.UTF_8);
  }

  // Probes current origin first, then automatically fails over across Tailscale (100.x) and Wi-Fi candidates
  private boolean probeOrigin(String candidateUrl) {
    HttpsURLConnection conn = null;
    try {
      conn = openPinnedConnection(candidateUrl, "/api/auth", "GET", 2400);
      int code = conn.getResponseCode();
      captureCookies(conn);
      return code >= 200 && code < 500;
    } catch (Exception e) {
      return false;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private String ensureReachableOrigin() {
    if (!origin.isEmpty() && probeOrigin(origin)) return origin;
    List<String> ordered = new ArrayList<>();
    // Prefer Tailscale 100.x when current fails, then try remaining candidates
    for (String c : candidates) {
      if (isTailscaleUrl(c) && !ordered.contains(c)) ordered.add(c);
    }
    for (String c : candidates) {
      if (!ordered.contains(c)) ordered.add(c);
    }
    for (String cand : ordered) {
      if (probeOrigin(cand)) {
        origin = cand;
        savePrefs();
        syncCookieToWebView();
        runOnUiThread(this::updateStatusBadge);
        return origin;
      }
    }
    return origin;
  }

  private void reconnectAndBootstrap(String ticket) {
    if (statusBadge != null) statusBadge.setText("Поиск ПК (Wi-Fi / Tailscale)…");
    io.execute(() -> {
      try {
        String reachable = ensureReachableOrigin();
        if (reachable.isEmpty()) throw new IOException("Компьютер недоступен");
        if (ticket != null && !ticket.isEmpty()) {
          HttpsURLConnection authConn = openPinnedConnection(reachable, "/api/auth", "POST", 6000);
          authConn.setDoOutput(true);
          authConn.setRequestProperty("Content-Type", "application/json");
          byte[] payload = new JSONObject().put("ticket", ticket).toString().getBytes(StandardCharsets.UTF_8);
          try (OutputStream os = authConn.getOutputStream()) {
            os.write(payload);
          }
          int code = authConn.getResponseCode();
          captureCookies(authConn);
          authConn.disconnect();
          if (code != 200) throw new IOException("Код уже использован или истёк. Создайте новый QR на ПК.");
        }
        // Check session status
        HttpsURLConnection check = openPinnedConnection(reachable, "/api/auth", "GET", 4500);
        String authBody = readStream(check.getResponseCode() < 400 ? check.getInputStream() : check.getErrorStream());
        captureCookies(check);
        check.disconnect();
        JSONObject authJson = new JSONObject(authBody);
        if (!authJson.optBoolean("authenticated", false)) {
          runOnUiThread(() -> {
            renderShell("pair");
            toast("Сессия истекла — отсканируйте новый QR в Настройки → Телефон");
          });
          return;
        }
        // Fetch models & recent chats
        HttpsURLConnection accConn = openPinnedConnection(reachable, "/api/accounts", "GET", 8000);
        if (accConn.getResponseCode() == 200) {
          JSONObject acc = new JSONObject(readStream(accConn.getInputStream()));
          JSONObject oa = acc.optJSONObject("openai");
          if (oa != null && oa.optBoolean("connected")) {
            JSONArray m = oa.optJSONArray("models");
            if (m != null && m.length() > 0) openaiDefaultModel = m.getJSONObject(0).optString("id", "gpt-6-astra");
          }
          JSONObject gm = acc.optJSONObject("gemini");
          if (gm != null && gm.optBoolean("connected")) {
            JSONArray m = gm.optJSONArray("models");
            if (m != null && m.length() > 0) geminiDefaultModel = m.getJSONObject(0).optString("id", "gemini-4-argon-medium");
          }
          JSONObject gk = acc.optJSONObject("grok");
          if (gk != null && gk.optBoolean("connected")) {
            JSONArray m = gk.optJSONArray("models");
            if (m != null && m.length() > 0) grokDefaultModel = m.getJSONObject(0).optString("id", "grok-4");
          }
        }
        accConn.disconnect();

        HttpsURLConnection chatsConn = openPinnedConnection(reachable, "/api/chats", "GET", 5000);
        if (chatsConn.getResponseCode() == 200) {
          JSONObject cj = new JSONObject(readStream(chatsConn.getInputStream()));
          JSONArray arr = cj.optJSONArray("chats");
          if (arr != null && arr.length() > 0 && activeChatId.isEmpty()) {
            String latestId = arr.getJSONObject(0).optString("id", "");
            if (!latestId.isEmpty()) loadConversation(latestId);
          }
        }
        chatsConn.disconnect();

        runOnUiThread(() -> {
          updateStatusBadge();
          if ("pair".equals(currentTab)) renderShell("chat");
        });
      } catch (Exception e) {
        runOnUiThread(() -> {
          updateStatusBadge();
          if (ticket != null) {
            renderShell("pair");
            toast(e.getMessage() != null ? e.getMessage() : "Ошибка подключения");
          }
        });
      }
    });
  }

  private void updateStatusBadge() {
    if (statusBadge == null) return;
    statusBadge.setText(formatOriginLabel(origin));
    statusBadge.setTextColor(origin.isEmpty() ? TEXT_MUTED : GREEN_DOT);
  }

  private void toast(String msg) {
    Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
  }

  private void renderShell(String tab) {
    currentTab = tab;
    if (files != null) {
      files.onReceiveValue(null);
      files = null;
    }
    if (web != null && !"studio".equals(tab)) {
      web.stopLoading();
      web.destroy();
      web = null;
    }

    root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(BG_BLACK);
    root.setOnApplyWindowInsetsListener((v, insets) -> {
      v.setPadding(
          insets.getSystemWindowInsetLeft(),
          insets.getSystemWindowInsetTop(),
          insets.getSystemWindowInsetRight(),
          insets.getSystemWindowInsetBottom());
      return insets;
    });

    // Top Antigravity Glass Bar
    LinearLayout topBar = new LinearLayout(this);
    topBar.setOrientation(LinearLayout.HORIZONTAL);
    topBar.setGravity(Gravity.CENTER_VERTICAL);
    topBar.setPadding(dp(12), dp(8), dp(12), dp(8));
    topBar.setBackgroundColor(0xFF0C0C10);

    TextView brand = new TextView(this);
    brand.setText("✦ AI Hub");
    brand.setTextColor(TEXT_MAIN);
    brand.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
    brand.setTypeface(Typeface.DEFAULT_BOLD);
    topBar.addView(brand);

    statusBadge = new TextView(this);
    statusBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
    statusBadge.setPadding(dp(10), dp(4), dp(10), dp(4));
    statusBadge.setOnClickListener(v -> {
      toast("Проверка связи (Tailscale / Wi-Fi)…");
      reconnectAndBootstrap(null);
    });
    LinearLayout.LayoutParams statusLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    topBar.addView(statusBadge, statusLp);
    updateStatusBadge();

    topBar.addView(navPill("Чат", "chat".equals(tab), () -> renderShell("chat")));
    topBar.addView(space(6));
    topBar.addView(navPill("Студия", "studio".equals(tab), () -> renderShell("studio")));
    topBar.addView(space(6));
    topBar.addView(navPill("Сеть / QR", "pair".equals(tab), () -> renderShell("pair")));

    root.addView(topBar);
    View divider = new View(this);
    divider.setBackgroundColor(GLASS_BORDER);
    root.addView(divider, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));

    bodyFrame = new LinearLayout(this);
    bodyFrame.setOrientation(LinearLayout.VERTICAL);
    root.addView(bodyFrame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

    if ("chat".equals(tab)) {
      buildNativeChatView();
    } else if ("studio".equals(tab)) {
      buildStudioWebView();
    } else {
      buildPairingView();
    }

    setContentView(root);
  }

  private View space(int widthDp) {
    View v = new View(this);
    v.setLayoutParams(new LinearLayout.LayoutParams(dp(widthDp), dp(1)));
    return v;
  }

  private Button navPill(String text, boolean active, Runnable onClick) {
    Button b = new Button(this);
    b.setText(text);
    b.setAllCaps(false);
    b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
    b.setMinimumHeight(dp(32));
    b.setMinHeight(dp(32));
    b.setMinimumWidth(0);
    b.setMinWidth(0);
    b.setPadding(dp(10), dp(4), dp(10), dp(4));
    b.setTextColor(active ? BG_BLACK : TEXT_MAIN);
    b.setBackground(box(active ? TEXT_MAIN : GLASS_PANEL, active ? TEXT_MAIN : GLASS_BORDER, 9));
    b.setOnClickListener(v -> onClick.run());
    return b;
  }

  private Button actionBtn(String text, boolean primary, Runnable onClick) {
    Button b = new Button(this);
    b.setText(text);
    b.setAllCaps(false);
    b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f);
    b.setPadding(dp(14), dp(10), dp(14), dp(10));
    b.setTextColor(primary ? BG_BLACK : TEXT_MAIN);
    b.setBackground(box(primary ? TEXT_MAIN : GLASS_PANEL, primary ? TEXT_MAIN : GLASS_BORDER, 11));
    b.setOnClickListener(v -> onClick.run());
    return b;
  }

  // 1. NATIVE ANDROID CHAT VIEW ("свой интерфейс чата")
  private void buildNativeChatView() {
    // Subbar: Provider switcher + History + New Chat + Work on PC toggle
    HorizontalScrollView subScroll = new HorizontalScrollView(this);
    subScroll.setHorizontalScrollBarEnabled(false);
    subScroll.setBackgroundColor(0xFF0B0B0F);
    LinearLayout subBar = new LinearLayout(this);
    subBar.setOrientation(LinearLayout.HORIZONTAL);
    subBar.setGravity(Gravity.CENTER_VERTICAL);
    subBar.setPadding(dp(10), dp(7), dp(10), dp(7));

    boolean isGpt = "openai".equals(selectedProvider);
    boolean isGemini = "gemini".equals(selectedProvider);
    boolean isGrok = "grok".equals(selectedProvider);
    subBar.addView(navPill("ChatGPT · Astra", isGpt, () -> {
      selectedProvider = "openai";
      selectedModel = openaiDefaultModel;
      renderShell("chat");
    }));
    subBar.addView(space(6));
    subBar.addView(navPill("Gemini · Argon", isGemini, () -> {
      selectedProvider = "gemini";
      selectedModel = geminiDefaultModel;
      renderShell("chat");
    }));
    subBar.addView(space(6));
    subBar.addView(navPill("Grok · X", isGrok, () -> {
      selectedProvider = "grok";
      selectedModel = grokDefaultModel;
      renderShell("chat");
    }));
    subBar.addView(space(6));
    subBar.addView(navPill(workMode ? "✓ ПК-Агент" : "ПК-Агент", workMode, () -> {
      if (!workMode && workDir.isEmpty()) {
        promptWorkDirDialog();
      } else {
        workMode = !workMode;
        renderShell("chat");
      }
    }));
    subBar.addView(space(6));
    subBar.addView(navPill("Диалоги", false, this::showChatsDialog));
    subBar.addView(space(6));
    subBar.addView(navPill("+ Новый", false, () -> {
      if (busy) return;
      activeChatId = "";
      currentMessages.clear();
      renderMessagesList();
    }));

    subScroll.addView(subBar);
    bodyFrame.addView(subScroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    // Messages stream
    chatScroll = new ScrollView(this);
    chatScroll.setFillViewport(true);
    chatMessagesView = new LinearLayout(this);
    chatMessagesView.setOrientation(LinearLayout.VERTICAL);
    chatMessagesView.setPadding(dp(12), dp(12), dp(12), dp(12));
    chatScroll.addView(chatMessagesView);
    bodyFrame.addView(chatScroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

    renderMessagesList();

    // Bottom Liquid Glass Composer
    LinearLayout composer = new LinearLayout(this);
    composer.setOrientation(LinearLayout.HORIZONTAL);
    composer.setGravity(Gravity.BOTTOM);
    composer.setPadding(dp(10), dp(8), dp(10), dp(8));
    composer.setBackground(box(GLASS_PANEL, GLASS_BORDER, 16));
    LinearLayout.LayoutParams compLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    compLp.setMargins(dp(10), dp(4), dp(10), dp(8));

    promptInput = new EditText(this);
    promptInput.setHint("Сообщение для " + ("openai".equals(selectedProvider) ? "ChatGPT…" : "grok".equals(selectedProvider) ? "Grok…" : "Gemini…"));
    promptInput.setHintTextColor(TEXT_MUTED);
    promptInput.setTextColor(TEXT_MAIN);
    promptInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    promptInput.setBackgroundColor(Color.TRANSPARENT);
    promptInput.setMaxLines(5);
    promptInput.setPadding(dp(8), dp(8), dp(8), dp(8));
    composer.addView(promptInput, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

    sendBtn = navPill(busy ? "Стоп" : "Отпр.", true, () -> {
      if (busy) stopGeneration();
      else sendNativeMessage();
    });
    composer.addView(sendBtn);

    bodyFrame.addView(composer, compLp);
  }

  private void renderMessagesList() {
    if (chatMessagesView == null) return;
    chatMessagesView.removeAllViews();
    if (currentMessages.isEmpty()) {
      LinearLayout welcome = new LinearLayout(this);
      welcome.setOrientation(LinearLayout.VERTICAL);
      welcome.setGravity(Gravity.CENTER);
      welcome.setPadding(dp(20), dp(36), dp(20), dp(20));

      TextView title = new TextView(this);
      title.setText("Один чат. Ваши модели.");
      title.setTextColor(TEXT_MAIN);
      title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
      title.setTypeface(Typeface.DEFAULT_BOLD);
      title.setGravity(Gravity.CENTER);
      welcome.addView(title);

      TextView sub = new TextView(this);
      sub.setText("Нативный клиент AI Hub (Antigravity Black). Прямое переключение между ChatGPT (Astra) и Gemini (Argon), сохранение сессии и автопереподключение через Tailscale.");
      sub.setTextColor(TEXT_MUTED);
      sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
      sub.setGravity(Gravity.CENTER);
      sub.setPadding(0, dp(8), 0, dp(16));
      welcome.addView(sub);

      chatMessagesView.addView(welcome);
      return;
    }

    for (JSONObject m : currentMessages) {
      String role = m.optString("role", "assistant");
      String text = m.optString("content", "");
      String modelName = m.optString("model", m.optString("provider", "AI"));
      boolean isUser = "user".equals(role);

      LinearLayout card = new LinearLayout(this);
      card.setOrientation(LinearLayout.VERTICAL);
      card.setPadding(dp(12), dp(10), dp(12), dp(10));
      card.setBackground(box(isUser ? GLASS_USER : GLASS_PANEL, GLASS_BORDER, 14));

      LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
      lp.setMargins(isUser ? dp(42) : 0, dp(4), isUser ? 0 : dp(12), dp(8));

      if (!isUser) {
        TextView head = new TextView(this);
        head.setText(modelName);
        head.setTextColor(TEXT_MUTED);
        head.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        head.setTypeface(Typeface.DEFAULT_BOLD);
        head.setPadding(0, 0, 0, dp(4));
        card.addView(head);
      }

      TextView body = new TextView(this);
      body.setText(text.isEmpty() ? "…" : text);
      body.setTextColor(TEXT_MAIN);
      body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f);
      body.setLineSpacing(dp(2), 1.05f);
      body.setTextIsSelectable(true);
      card.addView(body);

      chatMessagesView.addView(card, lp);
    }
    if (chatScroll != null) {
      chatScroll.post(() -> chatScroll.fullScroll(View.FOCUS_DOWN));
    }
  }

  private void promptWorkDirDialog() {
    EditText input = new EditText(this);
    input.setText(workDir);
    input.setHint("C:\\Users\\…\\Project");
    input.setTextColor(TEXT_MAIN);
    input.setHintTextColor(TEXT_MUTED);
    new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
        .setTitle("Рабочая папка на ПК")
        .setMessage("Укажите полный путь к папке на ноутбуке для режима «Работа на ПК»:")
        .setView(input)
        .setPositiveButton("Включить", (d, w) -> {
          String v = input.getText().toString().trim();
          if (!v.isEmpty()) {
            workDir = v;
            workMode = true;
            savePrefs();
            renderShell("chat");
          }
        })
        .setNegativeButton("Отмена", null)
        .show();
  }

  private void showChatsDialog() {
    io.execute(() -> {
      try {
        String reachable = ensureReachableOrigin();
        HttpsURLConnection conn = openPinnedConnection(reachable, "/api/chats", "GET", 5000);
        if (conn.getResponseCode() != 200) throw new IOException("Не удалось загрузить диалоги");
        JSONObject data = new JSONObject(readStream(conn.getInputStream()));
        conn.disconnect();
        JSONArray arr = data.optJSONArray("chats");
        if (arr == null || arr.length() == 0) {
          runOnUiThread(() -> toast("Диалогов пока нет"));
          return;
        }
        String[] titles = new String[arr.length()];
        String[] ids = new String[arr.length()];
        for (int i = 0; i < arr.length(); i++) {
          JSONObject c = arr.getJSONObject(i);
          titles[i] = c.optString("title", "Диалог");
          ids[i] = c.optString("id", "");
        }
        runOnUiThread(() -> new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Диалоги на ПК")
            .setItems(titles, (d, which) -> loadConversation(ids[which]))
            .setNegativeButton("Закрыть", null)
            .show());
      } catch (Exception e) {
        runOnUiThread(() -> toast("Ошибка загрузки: " + e.getMessage()));
      }
    });
  }

  private void loadConversation(String id) {
    io.execute(() -> {
      try {
        String reachable = ensureReachableOrigin();
        HttpsURLConnection conn = openPinnedConnection(reachable, "/api/chats/" + id, "GET", 6000);
        if (conn.getResponseCode() != 200) return;
        JSONObject data = new JSONObject(readStream(conn.getInputStream()));
        conn.disconnect();
        JSONArray msgs = data.optJSONArray("messages");
        if (msgs == null) return;
        List<JSONObject> loaded = new ArrayList<>();
        for (int i = 0; i < msgs.length(); i++) loaded.add(msgs.getJSONObject(i));
        runOnUiThread(() -> {
          activeChatId = id;
          currentMessages.clear();
          currentMessages.addAll(loaded);
          renderMessagesList();
        });
      } catch (Exception ignored) {}
    });
  }

  private void stopGeneration() {
    if (activeChatId.isEmpty()) return;
    io.execute(() -> {
      try {
        HttpsURLConnection conn = openPinnedConnection(origin, "/api/hub-chat", "DELETE", 4000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        try (OutputStream os = conn.getOutputStream()) {
          os.write(new JSONObject().put("chatId", activeChatId).toString().getBytes(StandardCharsets.UTF_8));
        }
        conn.getResponseCode();
        conn.disconnect();
      } catch (Exception ignored) {}
    });
  }

  private void sendNativeMessage() {
    if (busy || promptInput == null) return;
    final String text = promptInput.getText().toString().trim();
    if (text.isEmpty()) return;
    promptInput.setText("");
    busy = true;
    if (sendBtn != null) sendBtn.setText("Стоп");

    try {
      currentMessages.add(new JSONObject().put("role", "user").put("content", text));
      final JSONObject assistantMsg = new JSONObject()
          .put("role", "assistant")
          .put("provider", selectedProvider)
          .put("model", selectedModel)
          .put("content", "…");
      currentMessages.add(assistantMsg);
      renderMessagesList();

      io.execute(() -> {
        HttpsURLConnection conn = null;
        try {
          String reachable = ensureReachableOrigin();
          if (reachable.isEmpty()) throw new IOException("Компьютер недоступен по Wi-Fi и Tailscale");

          JSONObject body = new JSONObject();
          if (!activeChatId.isEmpty()) body.put("chatId", activeChatId);
          body.put("prompt", text);
          body.put("mode", "single");
          body.put("work", workMode);
          body.put("workDir", workDir);
          body.put("targets", new JSONArray().put(new JSONObject().put("provider", selectedProvider).put("model", selectedModel)));

          conn = openPinnedConnection(reachable, "/api/hub-chat", "POST", 10000);
          conn.setDoOutput(true);
          conn.setRequestProperty("Content-Type", "application/json");
          try (OutputStream os = conn.getOutputStream()) {
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
          }
          if (conn.getResponseCode() != 200) {
            String errText = readStream(conn.getErrorStream());
            throw new IOException(errText.isEmpty() ? "Ошибка HTTP " + conn.getResponseCode() : errText);
          }

          BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
          String line;
          final StringBuilder accText = new StringBuilder();
          while ((line = reader.readLine()) != null) {
            if (line.trim().isEmpty()) continue;
            JSONObject ev = new JSONObject(line);
            String type = ev.optString("type");
            if ("start".equals(type)) {
              activeChatId = ev.optString("chatId", activeChatId);
            } else if ("delta".equals(type)) {
              accText.append(ev.optString("text", ""));
              assistantMsg.put("content", accText.toString());
              runOnUiThread(this::renderMessagesList);
            } else if ("model-done".equals(type)) {
              String full = ev.optString("text", accText.toString());
              assistantMsg.put("content", full);
              runOnUiThread(this::renderMessagesList);
            } else if ("work-approval".equals(type)) {
              final String approvalId = ev.optString("id");
              final JSONObject act = ev.optJSONObject("action");
              runOnUiThread(() -> showNativeApprovalDialog(approvalId, act));
            } else if ("error".equals(type) || "model-error".equals(type)) {
              assistantMsg.put("content", "Ошибка: " + ev.optString("error", ev.optString("text", "Неизвестная ошибка")));
              runOnUiThread(this::renderMessagesList);
            }
          }
        } catch (Exception e) {
          try {
            assistantMsg.put("content", "Не удалось получить ответ: " + (e.getMessage() != null ? e.getMessage() : "ошибка сети"));
          } catch (Exception ignored) {}
          runOnUiThread(this::renderMessagesList);
        } finally {
          if (conn != null) conn.disconnect();
          busy = false;
          runOnUiThread(() -> {
            if (sendBtn != null) sendBtn.setText("Отпр.");
          });
        }
      });
    } catch (Exception ignored) {
      busy = false;
    }
  }

  private void showNativeApprovalDialog(String id, JSONObject action) {
    String summary = action != null ? action.toString() : "Действие на ПК";
    new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
        .setTitle("Разрешение действия на ПК")
        .setMessage(summary)
        .setCancelable(false)
        .setPositiveButton("Разрешить один раз", (d, w) -> sendWorkDecision(id, true))
        .setNegativeButton("Отклонить", (d, w) -> sendWorkDecision(id, false))
        .show();
  }

  private void sendWorkDecision(String id, boolean allow) {
    io.execute(() -> {
      try {
        HttpsURLConnection conn = openPinnedConnection(origin, "/api/work", "POST", 5000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        try (OutputStream os = conn.getOutputStream()) {
          os.write(new JSONObject().put("id", id).put("allow", allow).toString().getBytes(StandardCharsets.UTF_8));
        }
        conn.getResponseCode();
        conn.disconnect();
      } catch (Exception e) {
        runOnUiThread(() -> toast("Ошибка отправки решения: " + e.getMessage()));
      }
    });
  }

  // 2. FULL WEB STUDIO VIEW (Pinned TLS WebView with automatic Tailscale failover)
  private boolean isPinnedOriginUrl(String u) {
    try {
      Uri a = Uri.parse(u);
      if (!"https".equals(a.getScheme()) || a.getPort() != 3443) return false;
      String cand = "https://" + a.getHost() + ":3443";
      return cand.equals(origin) || candidates.contains(cand);
    } catch (Exception e) {
      return false;
    }
  }

  private void buildStudioWebView() {
    if (origin.isEmpty() || pin.isEmpty()) {
      renderShell("pair");
      return;
    }
    syncCookieToWebView();
    web = new WebView(this);
    web.setBackgroundColor(BG_BLACK);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(true);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    s.setSupportMultipleWindows(false);
    s.setSafeBrowsingEnabled(true);
    s.setJavaScriptCanOpenWindowsAutomatically(false);
    s.setMediaPlaybackRequiresUserGesture(true);
    s.setGeolocationEnabled(false);
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        String scheme = r.getUrl().getScheme();
        if (("https".equals(scheme) && !isPinnedOriginUrl(r.getUrl().toString()))
            || "http".equals(scheme)
            || "file".equals(scheme)) {
          return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
        }
        return null;
      }

      @Override
      public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
        runOnUiThread(() -> renderShell("chat"));
        return true;
      }

      @Override
      public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        try {
          byte[] cert = SslCertificate.saveState(error.getCertificate()).getByteArray("x509-certificate");
          byte[] digest = MessageDigest.getInstance("SHA-256").digest(cert);
          StringBuilder hex = new StringBuilder();
          for (byte b : digest) hex.append(String.format("%02x", b & 255));
          if (isPinnedOriginUrl(error.getUrl())
              && MessageDigest.isEqual(
                  hex.toString().getBytes(StandardCharsets.US_ASCII),
                  pin.getBytes(StandardCharsets.US_ASCII))) {
            handler.proceed();
            return;
          }
        } catch (Exception ignored) {}
        handler.cancel();
        runOnUiThread(() -> {
          toast("Сертификат ПК не совпал — создайте новый QR-код");
          renderShell("pair");
        });
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        String u = r.getUrl().toString();
        if (isPinnedOriginUrl(u)) return false;
        if (r.isForMainFrame() && r.hasGesture() && "https".equals(r.getUrl().getScheme())) {
          try {
            startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl()));
          } catch (Exception ignored) {}
        }
        return true;
      }

      @Override
      public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
        if (r.isForMainFrame()) {
          io.execute(() -> {
            String prev = origin;
            String next = ensureReachableOrigin();
            runOnUiThread(() -> {
              if (!next.isEmpty() && !next.equals(prev) && web != null) {
                toast("Переключено на " + formatOriginLabel(next));
                web.loadUrl(next + "/");
              } else {
                toast("ПК недоступен. Проверьте Tailscale или Wi-Fi.");
              }
            });
          });
        }
      }

      @Override
      public void onPageFinished(WebView v, String u) {
        CookieManager.getInstance().flush();
      }
    });

    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (files != null) files.onReceiveValue(null);
        files = callback;
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try {
          startActivityForResult(i, 10);
          return true;
        } catch (Exception e) {
          files = null;
          return false;
        }
      }
    });

    bodyFrame.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
    web.loadUrl(origin + "/");
  }

  // 3. PAIRING, QR SCANNER & TAILSCALE FAILOVER VIEW ("Сеть / QR")
  private void buildPairingView() {
    ScrollView scroll = new ScrollView(this);
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(16), dp(16), dp(16), dp(24));

    LinearLayout hero = new LinearLayout(this);
    hero.setOrientation(LinearLayout.VERTICAL);
    hero.setPadding(dp(16), dp(16), dp(16), dp(16));
    hero.setBackground(box(GLASS_PANEL, GLASS_BORDER, 16));

    TextView h1 = new TextView(this);
    h1.setText("Подключение к ноутбуку");
    h1.setTextColor(TEXT_MAIN);
    h1.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
    h1.setTypeface(Typeface.DEFAULT_BOLD);
    hero.addView(h1);

    TextView desc = new TextView(this);
    desc.setText("На компьютере откройте AI Hub → Настройки → Телефон → «Создать код подключения».\n\n• Сканируйте QR-код камерой: сохраняются оба адреса (Tailscale 100.x и домашний Wi-Fi) с автопереподключением.\n• Сертификат компьютера жёстко привязывается по SHA-256.");
    desc.setTextColor(TEXT_MUTED);
    desc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
    desc.setPadding(0, dp(8), 0, dp(14));
    hero.addView(desc);

    hero.addView(actionBtn("📷 Сканировать QR-код камерой", true, this::launchQrScanner));
    View sp1 = new View(this);
    sp1.setLayoutParams(new LinearLayout.LayoutParams(1, dp(8)));
    hero.addView(sp1);
    hero.addView(actionBtn("📋 Подключить из буфера обмена (1 касание)", false, this::pasteAndPairFromClipboard));

    box.addView(hero);

    if (!candidates.isEmpty()) {
      LinearLayout savedCard = new LinearLayout(this);
      savedCard.setOrientation(LinearLayout.VERTICAL);
      savedCard.setPadding(dp(16), dp(14), dp(16), dp(14));
      savedCard.setBackground(box(GLASS_PANEL, GLASS_BORDER, 16));
      LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
      slp.setMargins(0, dp(12), 0, 0);

      TextView st = new TextView(this);
      st.setText("Сохранённые сети ПК (автопереключение)");
      st.setTextColor(TEXT_MAIN);
      st.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
      st.setTypeface(Typeface.DEFAULT_BOLD);
      savedCard.addView(st);

      for (String cand : candidates) {
        View sp = new View(this);
        sp.setLayoutParams(new LinearLayout.LayoutParams(1, dp(6)));
        savedCard.addView(sp);
        boolean isCurrent = cand.equals(origin);
        savedCard.addView(actionBtn(
            (isCurrent ? "✓ " : "") + formatOriginLabel(cand),
            isCurrent,
            () -> {
              origin = cand;
              savePrefs();
              syncCookieToWebView();
              reconnectAndBootstrap(null);
              renderShell("chat");
            }));
      }
      box.addView(savedCard, slp);
    }

    // Manual fallback card
    LinearLayout manualCard = new LinearLayout(this);
    manualCard.setOrientation(LinearLayout.VERTICAL);
    manualCard.setPadding(dp(16), dp(14), dp(16), dp(14));
    manualCard.setBackground(box(GLASS_PANEL, GLASS_BORDER, 16));
    LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    mlp.setMargins(0, dp(12), 0, 0);

    TextView mt = new TextView(this);
    mt.setText("Или вставьте ссылку aihub://pair вручную");
    mt.setTextColor(TEXT_MUTED);
    mt.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
    manualCard.addView(mt);

    pairInput = new EditText(this);
    pairInput.setTextColor(TEXT_MAIN);
    pairInput.setHintTextColor(TEXT_MUTED);
    pairInput.setHint("aihub://pair?data=…");
    pairInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    pairInput.setMinLines(2);
    manualCard.addView(pairInput);

    manualCard.addView(actionBtn("Подключить по коду", false, () -> acceptPairCode(pairInput.getText().toString().trim())));
    box.addView(manualCard, mlp);

    scroll.addView(box);
    bodyFrame.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
  }

  private void launchQrScanner() {
    // Try standard barcode/QR scanner intents first; if unavailable, launch system Camera (which supports aihub://pair deep-link)
    String[] actions = new String[] {
      "com.google.zxing.client.android.SCAN",
      "com.huawei.hms.hmsscankit.SCAN"
    };
    for (String act : actions) {
      try {
        Intent scan = new Intent(act);
        scan.putExtra("SCAN_MODE", "QR_CODE_MODE");
        startActivityForResult(scan, 20);
        return;
      } catch (Exception ignored) {}
    }
    try {
      Intent cam = new Intent("android.media.action.STILL_IMAGE_CAMERA");
      startActivity(cam);
      toast("Наведите камеру на QR-код и нажмите на появившуюся ссылку AI Hub");
    } catch (Exception e) {
      toast("Скопируйте код на ПК и нажмите «Подключить из буфера обмена»");
    }
  }

  private void pasteAndPairFromClipboard() {
    try {
      ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
      if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip() != null && cm.getPrimaryClip().getItemCount() > 0) {
        CharSequence text = cm.getPrimaryClip().getItemAt(0).coerceToText(this);
        if (text != null) {
          String raw = text.toString().trim();
          if (raw.contains("aihub://pair")) {
            int idx = raw.indexOf("aihub://pair");
            acceptPairCode(raw.substring(idx).split("\\s+")[0]);
            return;
          }
        }
      }
      toast("В буфере обмена нет ссылки aihub://pair");
    } catch (Exception e) {
      toast("Не удалось прочитать буфер обмена");
    }
  }

  private void acceptPairCode(String value) {
    try {
      if (value == null || value.length() > 4096) throw new Exception();
      Uri link = Uri.parse(value.trim());
      if (!"aihub".equals(link.getScheme()) || !"pair".equals(link.getHost())) throw new Exception();
      JSONObject p = new JSONObject(new String(Base64.getUrlDecoder().decode(link.getQueryParameter("data")), StandardCharsets.UTF_8));
      String next = p.getString("url");
      String hash = p.getString("fingerprint");
      String ticket = p.getString("ticket");
      Uri url = Uri.parse(next);
      String host = url.getHost();
      if (!"https".equals(url.getScheme()) || url.getPort() != 3443 || url.getUserInfo() != null || host == null || !allowedHost(host)) {
        throw new Exception();
      }
      if (!hash.matches("[a-f0-9]{64}") || !ticket.matches("[a-f0-9]{64}")) throw new Exception();

      origin = "https://" + host + ":3443";
      pin = hash;
      if (!candidates.contains(origin)) candidates.add(0, origin);

      JSONArray candArr = p.optJSONArray("candidates");
      if (candArr != null) {
        for (int i = 0; i < candArr.length(); i++) {
          String cUrl = candArr.optString(i, "");
          Uri cu = Uri.parse(cUrl);
          if ("https".equals(cu.getScheme()) && cu.getPort() == 3443 && allowedHost(cu.getHost())) {
            String normalized = "https://" + cu.getHost() + ":3443";
            if (!candidates.contains(normalized)) candidates.add(normalized);
          }
        }
      }
      savePrefs();
      CookieManager.getInstance().removeAllCookies(ok -> {
        renderShell("chat");
        reconnectAndBootstrap(ticket);
      });
    } catch (Exception e) {
      toast("Некорректный код. Создайте новый QR-код на компьютере.");
    }
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == 20 && result == RESULT_OK && data != null) {
      String contents = data.getStringExtra("SCAN_RESULT");
      if (contents == null && data.getData() != null) contents = data.getData().toString();
      if (contents != null) acceptPairCode(contents);
      return;
    }
    if (request == 10 && files != null) {
      Uri[] selected = null;
      if (result == RESULT_OK && data != null) {
        if (data.getClipData() != null) {
          int n = Math.min(3, data.getClipData().getItemCount());
          selected = new Uri[n];
          for (int i = 0; i < n; i++) selected[i] = data.getClipData().getItemAt(i).getUri();
        } else if (data.getData() != null) {
          selected = new Uri[] { data.getData() };
        }
      }
      files.onReceiveValue(selected);
      files = null;
    }
  }

  @Override
  public void onBackPressed() {
    if ("studio".equals(currentTab) && web != null && web.canGoBack()) {
      web.goBack();
    } else if (!"chat".equals(currentTab) && !origin.isEmpty()) {
      renderShell("chat");
    } else {
      moveTaskToBack(true);
    }
  }

  @Override
  protected void onPause() {
    if (web != null) web.onPause();
    CookieManager.getInstance().flush();
    super.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (web != null) web.onResume();
    if (!origin.isEmpty() && !pin.isEmpty() && !busy) {
      io.execute(this::ensureReachableOrigin);
    }
  }

  @Override
  protected void onDestroy() {
    if (files != null) files.onReceiveValue(null);
    if (web != null) web.destroy();
    io.shutdownNow();
    super.onDestroy();
  }
}
