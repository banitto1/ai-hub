"use client";
import { useState } from "react";

export default function PhonePanel() {
  const [pair, setPair] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect(host?: string) {
    setBusy(true);
    setError("");
    try {
      const d = window.desktop as any;
      if (!d?.pairPhone) throw Error("Создайте код в настольном AI Hub на компьютере.");
      setPair(await d.pairPhone(host));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel glass phone-panel">
      <h2>AI Hub для Android</h2>
      <p className="muted">
        Установите AI Hub.apk. Вне дома: включите Tailscale на ноутбуке и телефоне, войдя одним аккаунтом. Создайте код и отсканируйте QR камерой или в приложении (сохраняются и Tailscale 100.x, и домашний Wi-Fi с автопереподключением). Ноутбук должен оставаться включённым, AI Hub — открытым.
      </p>
      <button className="primary" disabled={busy} onClick={() => void connect()}>
        {busy ? "Создание соединения…" : "Создать код подключения"}
      </button>
      {error && <p className="alert">{error}</p>}
      {pair && (
        <>
          <p>Отсканируйте QR-код камерой телефона или вставьте код в мобильном приложении. Он действует 10 минут и используется один раз.</p>
          {pair.addresses.length > 1 && (
            <select value={pair.host} onChange={e => void connect(e.target.value)} aria-label="Сеть компьютера">
              {pair.addresses.map((x: any) => (
                <option key={x.address} value={x.address}>
                  {x.remote ? "Через интернет · Tailscale" : x.name} · {x.address}
                </option>
              ))}
            </select>
          )}
          <img src={pair.qr} width={240} height={240} alt="QR-код подключения телефона" />
          <textarea readOnly value={pair.code} aria-label="Код подключения телефона" />
          <div className="row-actions">
            <button className="secondary" onClick={() => void navigator.clipboard.writeText(pair.code).catch(e => setError(String(e)))}>
              Копировать код
            </button>
            <button
              className="secondary"
              onClick={() => {
                (window.desktop as any)?.stopPhone();
                setPair(null);
              }}
            >
              Отключить доступ с телефона
            </button>
          </div>
          <p className="muted">
            Код даёт доступ к вашим чатам. Соединение зашифровано TLS, приложение проверяет отпечаток сертификата компьютера и автоматически переключается между Wi-Fi и Tailscale.
          </p>
        </>
      )}
    </section>
  );
}
