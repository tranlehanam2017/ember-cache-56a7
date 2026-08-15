/**
 * NHIỆM VỤ NGÀY CÓ TRẦN LƯỢT — danh sách quyết định cái gì được phép nhớ「hôm nay xong rồi」.
 *
 * Vì sao phải có một danh sách thay vì tin thẳng vào kết cục `alreadyDone`: `alreadyDone` chỉ
 * nói「trang không còn gì để bấm và cũng không có đồng hồ nào đang chạy」. Với chín nhiệm vụ
 * dưới đây câu ấy đồng nghĩa với「hết lượt của ngày hôm nay」, vì trần của chúng là trần NGÀY
 * và chỉ mốc sang ngày mới mở lại. Nhưng cùng một kết cục ấy, ở Mê Cung hay Luyện Đan Đường,
 * lại có thể chỉ là một trạng thái thoáng qua của cái lò — nhớ nhầm nó là tắt mất nhiệm vụ
 * đáng giá nhất trong ngày mà không ai được báo. Nên phạm vi được KHAI RÕ, không suy đoán.
 *
 * Khoá theo ID chứ không theo TÊN: cặp twin VIP/thường cố ý trùng tên nhau (xem
 * `questsForAccount`), còn ID mới là khoá chính của hồ sơ. Cả hai bản của một nhiệm vụ đều có
 * mặt ở đây vì trần lượt là của TÀI KHOẢN, không phải của cái flow chạy nó.
 *
 * Đổi ID trong hồ sơ mà quên chỗ này thì tính năng lặng lẽ ngừng hoạt động — nên `npm run
 * smoke` đối chiếu từng ID dưới đây với hồ sơ thật và ĐỎ khi có cái không còn tồn tại.
 */
export const DAILY_QUOTA_QUEST_IDS = new Set([
  "diem-danh",
  "diem-danh-thuong",
  "phuc-loi-duong",
  "phuc-loi-duong-thuong",
  "hoang-vuc",
  "hoang-vuc-thuong",
  "thi-luyen-tong-mon",
  "thi-luyen-tong-mon-thuong",
  "te-le-tong-mon",
  "te-le-tong-mon-thuong",
  "phuc-loi-vip-khac-tran-van",
  "vong-quay-phuc-van",
  "vong-quay-phuc-van-thuong",
  "van-dap",
  "van-dap-thuong",
  "bi-canh-tong-mon",
  // Khoáng Mạch: trần NGÀY thật — hai ô Tu Vi/Tinh Thạch server render trên trang, và trần
  // ĐỔI mỗi ngày (14/08 đo 300/100, 15/08 đo 600/200 — không có con số「N lần nhận」nào).
  // `alreadyDone` của nó chỉ phát từ MỘT chỗ: stopIf「đã đầy trần」đọc số x/y ấy — đúng hình
  // dạng mà dailyCapReached đi tìm. Đường「đang đào dở」thoát bằng onCooldown kèm đồng hồ
  // nên không bao giờ lạc vào sổ này.
  "khoang-mach",
  "khoang-mach-thuong",
]);

/** Nhiệm vụ này có trần lượt theo ngày không. */
export function isDailyQuotaQuest(quest) {
  return quest != null && DAILY_QUOTA_QUEST_IDS.has(quest.id);
}

/**
 * Nhiệm vụ mà LÀM XONG cũng chính là「hết lượt hôm nay」— không cần chờ trang tự nói.
 *
 * Với hầu hết nhiệm vụ ngày, `completed` chỉ nghĩa là「vừa xong MỘT lượt」: Bí Cảnh có 5 lượt,
 * ghi sổ ngay lượt đầu là vứt bốn lượt còn lại. Nên danh sách này hẹp, và một ID chỉ được vào
 * đây khi chính SCRIPT của nó đã bắt trang game xác nhận hết ngày trước khi được phép báo xong.
 *
 * Vấn Đáp là đúng hình dạng ấy: cả 5 câu của ngày nằm trong MỘT phiên (một cú bấm「bắt đầu」tải
 * trọn), và bước cuối của script là một `waitForCondition` KHÔNG optional đòi thấy chữ「hoàn
 * thành Vấn Đáp」trong `#quiz-wrapper`. Dừng giữa chừng thì bước ấy đỏ và kết cục là `failed`,
 * không phải `completed` — nên `completed` ở đây đã mang sẵn lời xác nhận của chính trang game,
 * đúng thứ mà `dailyCapReached` đi tìm.
 *
 * Vì sao cần: trước bản này, Vấn Đáp KHÔNG BAO GIỜ vào sổ. Đo trên đàn thật ngày 11/08/2026 —
 * nó báo「xong」ở cả 21:55, 22:12, 22:31, 22:48, 23:06, tức mỗi vòng một lần mở trang cho một
 * nhiệm vụ mà cả ngày chỉ có 5 câu. Lý do: lượt chạy ĐẦU của ngày kết thúc `completed` nên
 * không có gì được ghi, còn `stopIf`「đã hoàn thành vấn đáp hôm nay」ở đầu script thì lấy mẫu
 * ĐÚNG MỘT LẦN ngay sau khi vỏ trang dựng xong — mà trang này vẽ ruột bằng một XHR 2–4 giây
 * sau, nên lúc nó nhìn thì `#quiz-wrapper` còn trống. Các vòng sau vì thế cứ mở lại trang, để
 * rồi bước cuối thấy chữ hoàn thành và lại báo「xong」.
 */
export const COMPLETION_ENDS_DAY_QUEST_IDS = new Set(["van-dap", "van-dap-thuong"]);

/**
 * Kết quả vừa rồi có phải lời khai「hôm nay hết lượt」không.
 *
 * HAI đường vào sổ, và cả hai đều đòi chính TRANG GAME xác nhận — khác nhau ở chỗ nó xác nhận
 * lúc nào:
 *
 *   1. Dừng sớm vì một bước `stopIf` khớp (`alreadyDone` + `dailyCapReached`). Cờ ấy chỉ được
 *      engine gắn ở đúng chỗ đó. Vấn Đáp dừng vì khôi lỗi chưa biết đáp án cũng ra
 *      `alreadyDone`, nhưng đó là giới hạn của TA chứ không phải của tài khoản: nhớ nó thành
 *     「đã đủ lượt」là khoá cứng nhiệm vụ cả ngày đúng vào lúc kho đáp án có thể vừa học thêm
 *      được câu ấy. Nên nhánh này soát cờ, không soát kết cục.
 *   2. Chạy trọn và báo xong, với những nhiệm vụ mà「xong」ĐÃ đồng nghĩa hết ngày — xem
 *      `COMPLETION_ENDS_DAY_QUEST_IDS`. Thiếu nhánh này thì lượt chạy đầu tiên của ngày, cái
 *      lượt làm THẬT, lại là lượt duy nhất không ghi được gì vào sổ.
 *
 * `isDailyQuotaQuest` gác trước cả hai nhánh: một ID không phải nhiệm vụ ngày thì không có
 * đường nào vào sổ, kể cả khi ai đó lỡ tay thêm nó vào danh sách thứ hai.
 */
export function reachedDailyQuota(quest, outcome) {
  if (!isDailyQuotaQuest(quest)) return false;
  if (outcome?.outcome === "alreadyDone" && outcome?.dailyCapReached === true) return true;
  return outcome?.outcome === "completed" && COMPLETION_ENDS_DAY_QUEST_IDS.has(quest.id);
}
