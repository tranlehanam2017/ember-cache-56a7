/**
 * Lời gọi `/api/worker` BIẾT ĐI THEO bảng điều phối.
 *
 * Sinh ra từ lượt diễn tập chuyển trạm 10/08/2026, nơi §8 của deploy/mirror/README.md lộ ra là
 * chưa từng được viết: web đã sang trạm gương, người dùng vẫn vào được, nhưng khôi lỗi tông môn
 * trên VM cứ nện vào trạm cũ để nhận 409 rồi vứt đi — `WEB_URL` là hằng số trong env của nó.
 * Đàn nằm im cho tới khi có người sửa tay. Đo được: `tong-mon-khoiloi` điểm danh lần cuối lúc
 * 16:54, im suốt 20 phút, chỉ sống lại khi bảng tình cờ lật về đúng chỗ nó đang trỏ.
 *
 * ĐI THEO 409, KHÔNG TỰ ĐỌC BẢNG. Đọc bảng thì phải xác minh chữ ký, mà khoá ký là
 * `WORKER_TOKEN` của deployment — khôi lỗi máy nhà cầm linh phù cá nhân thì không có nó, nên
 * cả một nhánh khôi lỗi sẽ không dùng được. Còn 409 thì trạm đã nghỉ phát cho MỌI khôi lỗi,
 * kèm sẵn `activeUrl` lấy từ bảng nó vừa xác minh. Một đường, dùng chung cho cả hai vai.
 *
 * PHÂN BIỆT HAI LOẠI 409 — đây là chỗ dễ vào sai nhất. `/api/worker` cũng trả 409 cho
 * 「job is no longer active」. Nên dấu hiệu để đi theo KHÔNG PHẢI mã trạng thái mà là **có một
 * `activeUrl` https hợp lệ và khác chỗ đang đứng**. Thiếu bất kỳ vế nào thì đây là lỗi thật,
 * ném nguyên văn lên như cũ.
 *
 * KHÔNG GHI NHỚ XUỐNG ĐĨA. Khởi động lại là đọc `WEB_URL` từ env rồi lại đi theo 409 lần đầu
 * gặp — hệ tự lành, và không có tệp trạng thái nào để lệch với bảng.
 *
 * CỬA THOÁT KHI TRẠM CHẾT HẲN. Ngày 08/09/2026, tám khôi lỗi cùng trỏ vào một deployment
 * Vercel bị khoá vì vượt Edge Requests. Mép Vercel trả 402 DEPLOYMENT_DISABLED, nên request
 * không bao giờ tới app để nhận 409; tám runner còn sống nhưng gõ vào xác ấy mỗi 5 giây suốt
 * hơn bảy giờ. `WORKER_FALLBACK_URL` là một origin HTTPS tin cậy do bộ cài/workflow khai sẵn:
 * lỗi mạng hoặc 502/503/504 đổi địa chỉ cho LƯỢT KẾ (không phát lại một POST chưa biết đã tới
 * server chưa); mã `DEPLOYMENT_*` chắc chắn bị chặn ở mép thì được phép thử lại ngay.
 */

/** Trạm đã nghỉ trả mã này kèm `activeUrl`. Trùng mã với「job is no longer active」— xem trên. */
const CONFLICT = 409;

/** Gateway đã trả lời nhưng không có bằng chứng request từng tới app — đổi đường, không replay. */
const TRANSIENT_GATEWAY_ERRORS = new Set([502, 503, 504]);

/** Những mã của chính nền tảng deployment: request bị chặn trước ứng dụng nên replay là an toàn. */
const DEAD_DEPLOYMENT = /\bDEPLOYMENT_(?:BLOCKED|DELETED|DISABLED|NOT_FOUND|PAUSED)\b/;

/** Bỏ dấu `/` cuối để so sánh hai địa chỉ không vấp vào khác biệt vô nghĩa. */
export function normalizeBase(url) {
  return String(url ?? "").trim().replace(/\/+$/, "");
}

/**
 * Origin dự phòng mang token worker nên phải hẹp hơn `activeUrl`: HTTPS tuyệt đối, không user,
 * path, query hay hash. Nó đến từ env/bản workflow chứ không đến từ phản hồi mạng.
 */
export function parseFallbackUrl(raw) {
  const normalized = normalizeBase(raw);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname && parsed.pathname !== "/") ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Thân hoặc header Vercel có nói thẳng deployment đã chết trước khi request tới app không. */
export function isDeadDeploymentResponse(status, bodyText, platformCode = "") {
  return status >= 400 && DEAD_DEPLOYMENT.test(`${platformCode}\n${bodyText}`);
}

/**
 * Rút `activeUrl` khỏi thân một phản hồi 409, hoặc `null` nếu không có gì đáng đi theo.
 *
 * Chỉ nhận `https://` — và đây không phải sự cẩn thận trang trí: khôi lỗi gửi token của nó
 * theo MỌI request, nên địa chỉ nền là thứ quyết định token đi về đâu. Bảng điều phối chỉ
 * chứa https (control/doc.ts ép bằng schema), nên siết ở đây không bỏ sót ca hợp lệ nào.
 */
export function parseActiveUrl(bodyText) {
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return null;
  }
  const raw = typeof data?.activeUrl === "string" ? normalizeBase(data.activeUrl) : "";
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" ? raw : null;
}

/**
 * Dựng hàm `call` cho một khôi lỗi.
 *
 * `fetchImpl` và `log` tiêm được để `verify:worker-follow` lái toàn bộ nhánh mà không cần
 * mạng — bài học của chính buổi này: một luật chỉ chạy đúng ngày chuyển trạm mà không có phép
 * kiểm thì nó sẽ sai vào đúng ngày ấy.
 */
export function createWorkerCall({ webUrl, fallbackUrl = "", token, fetchImpl = fetch, log = console.log }) {
  let base = normalizeBase(webUrl);
  const fallback = parseFallbackUrl(fallbackUrl);

  /** Đổi đúng một biến trong bộ nhớ; mọi op sau tự đi đường mới. */
  const useFallback = (why, expectedBase) => {
    // claim, heartbeat và event có thể cùng bay. Một phản hồi cũ về muộn không được kéo địa chỉ
    // ngược khỏi chỗ mà một request mới hơn vừa chọn.
    if (base !== expectedBase || !fallback || fallback === base) return false;
    const failed = expectedBase;
    base = fallback;
    log(`Cổng khôi lỗi không dùng được (${why}): ${failed} → ${fallback}. Chuyển sang cổng dự phòng.`);
    return true;
  };

  const call = async (op, payload = {}, { allowFollow = true, allowFallback = true } = {}) => {
    const requestBase = base;
    let res;
    try {
      res = await fetchImpl(`${requestBase}/api/worker`, {
        method: "POST",
        // Không cho một 30x bất kỳ mang Bearer token sang Location do bên kia chọn.
        redirect: "manual",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ op, ...payload }),
      });
    } catch (err) {
      // Không replay: một POST mất phản hồi có thể đã được app nhận. Vòng ngoài vốn sẽ gọi lại
      // sau 5 giây; chỉ đổi đường cho chính lượt gọi kế ấy.
      if (allowFallback) useFallback(err instanceof Error ? err.message : "lỗi mạng", requestBase);
      throw err;
    }

    if (!res.ok) {
      // Đọc thân MỘT LẦN: `res.text()` rồi `res.json()` trên cùng phản hồi là lỗi "body đã dùng".
      const text = await res.text();

      if (res.status === CONFLICT && allowFollow) {
        const next = parseActiveUrl(text);
        // `next === requestBase` nghĩa là trạm này tự nhận đã nghỉ nhưng lại chỉ về chính nó — một
        // mâu thuẫn (SITE_ID lệch bảng?) mà đi theo cũng không giải được. Ném lên để thấy.
        if (next && next !== requestBase && base === requestBase) {
          log(`Trạm hoạt động đã đổi: ${requestBase} → ${next}. Đi theo bảng điều phối.`);
          base = next;
          // Đúng MỘT lần thử lại. Trạm mới cũng trả 409 thì đó là lỗi thật (hoặc hai trạm đang
          // ping-pong trong lúc cache bảng nguội) — ném lên, vòng lặp ngoài sẽ hỏi lại sau.
          return call(op, payload, { allowFollow: false, allowFallback });
        }
      }

      const platformCode = typeof res.headers?.get === "function"
        ? (res.headers.get("x-vercel-error") ?? "")
        : "";

      if (
        allowFallback &&
        isDeadDeploymentResponse(res.status, text, platformCode) &&
        useFallback(platformCode || `HTTP ${res.status}`, requestBase)
      ) {
        // DEPLOYMENT_* do mép nền tảng trả trước app — thao tác chưa chạy, replay ngay là an toàn.
        return call(op, payload, { allowFollow, allowFallback: false });
      }

      if (allowFallback && TRANSIENT_GATEWAY_ERRORS.has(res.status)) {
        // 502/503/504 có thể xuất hiện sau khi upstream đã nhận POST. Chuyển đường nhưng để vòng
        // ngoài phát thao tác kế, cùng nguyên tắc với lỗi mạng ở trên.
        useFallback(`HTTP ${res.status}`, requestBase);
      }

      throw new Error(`${op} → HTTP ${res.status} ${text}`);
    }

    return res.json();
  };

  return { call, currentUrl: () => base };
}
