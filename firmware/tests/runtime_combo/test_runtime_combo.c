/* runtime_combo.c のホスト PC 上での動作テスト (キー押下・タイムアウトを模擬) */
#include <stdio.h>
#include <stdlib.h>
#include "harness.h"

static int64_t now;
static char log_buf[4096];
static struct zmk_behavior_binding layer0[126];
static uint8_t highest_layer;
extern int (*harness_listener)(const zmk_event_t *);
extern int (*harness_sys_init)(void);
static struct k_work_delayable *timer;
static int failures;

int64_t k_uptime_get(void) { return now; }
void k_work_init_delayable(struct k_work_delayable *w, void (*h)(struct k_work *)) { w->handler = h; timer = w; }
int k_work_schedule(struct k_work_delayable *w, int64_t ms) { w->due = now + ms; w->scheduled = true; return 0; }
int k_work_cancel_delayable(struct k_work_delayable *w) { w->scheduled = false; return 0; }

static void log_add(const char *s) { strncat(log_buf, s, sizeof(log_buf) - strlen(log_buf) - 1); }

struct zmk_position_state_changed_event copy_raised_zmk_position_state_changed(const struct zmk_position_state_changed *ev) {
    struct zmk_position_state_changed_event e = {.header = {1}, .data = *ev};
    return e;
}
const struct zmk_position_state_changed *as_zmk_position_state_changed(const zmk_event_t *eh) {
    return &((const struct zmk_position_state_changed_event *)eh)->data;
}
/* 後段 (キーマップ) に流れたキー */
static void downstream(const struct zmk_position_state_changed *d) {
    char b[32];
    snprintf(b, sizeof b, "%s%u ", d->state ? "+" : "-", d->position);
    log_add(b);
}
void harness_release(struct zmk_position_state_changed_event *ev) { downstream(&ev->data); }
void harness_raise(struct zmk_position_state_changed_event *ev) {
    struct zmk_position_state_changed_event copy = *ev;
    int r = harness_listener(&copy.header);
    if (r == ZMK_EV_EVENT_BUBBLE) downstream(&copy.data);
}
const struct zmk_behavior_binding *zmk_keymap_get_layer_binding_at_idx(uint8_t layer, uint8_t idx) { return &layer0[idx]; }
uint8_t zmk_keymap_highest_layer_active(void) { return highest_layer; }
int zmk_keymap_position_state_changed(uint8_t s, uint32_t pos, bool pressed, int64_t ts) {
    char b[32];
    snprintf(b, sizeof b, "%sOUT%u ", pressed ? "+" : "-", pos - 110);
    log_add(b);
    return 0;
}

static void key(uint32_t pos, bool down) {
    struct zmk_position_state_changed_event ev = {.header = {1}, .data = {.source = 0, .position = pos, .state = down, .timestamp = now}};
    int r = harness_listener(&ev.header);
    if (r == ZMK_EV_EVENT_BUBBLE) downstream(&ev.data);
}
static void wait_ms(int ms) {
    for (int i = 0; i < ms; i++) {
        now++;
        if (timer && timer->scheduled && now >= timer->due) {
            timer->scheduled = false;
            timer->handler(&timer->work);
        }
    }
}
static void combo(int slot, uint64_t keys, int timeout, int groups, int layers) {
    uint32_t p1 = (uint32_t)(keys & 0x7FFFFFFF);
    uint32_t p2 = (uint32_t)((keys >> 31) & 0x7FF) | (timeout << 11) | (groups << 21) | (layers << 26);
    layer0[94 + slot] = (struct zmk_behavior_binding){"rt_combo", p1, p2};
}
static void expect(const char *name, const char *want) {
    if (strcmp(log_buf, want) != 0) {
        printf("FAIL %s\n  want: '%s'\n  got:  '%s'\n", name, want, log_buf);
        failures++;
    } else {
        printf("ok   %s: %s\n", name, log_buf);
    }
    log_buf[0] = 0;
    wait_ms(2000);
    log_buf[0] = 0;
}

int main(void) {
    for (int i = 0; i < 126; i++) layer0[i] = (struct zmk_behavior_binding){"none", 0, 0};
    harness_sys_init();
    combo(0, (1ULL << 10) | (1ULL << 11), 50, 0, 0);                   /* A+S */
    combo(1, (1ULL << 20) | (1ULL << 21), 50, 1, 0);                   /* Z+X: グループ 0 (BT1) のみ */
    combo(2, (1ULL << 30) | (1ULL << 31), 50, 0, 0);                   /* 31 bit 目をまたぐキー */
    combo(3, (1ULL << 1) | (1ULL << 2), 50, 0, 0);                     /* 1+2 */
    combo(4, (1ULL << 1) | (1ULL << 2) | (1ULL << 3), 50, 0, 0);       /* 1+2+3 */
    layer0[94 + 5] = (struct zmk_behavior_binding){"rt_combo", (1 << 5) | (1 << 6), 0}; /* 判定時間 0 = 未使用 */
    combo(6, (1ULL << 40) | (1ULL << 41) | (1ULL << 39), 60, 0, 0);    /* 3 キー */

    key(10, true); wait_ms(10); key(11, true); wait_ms(30); key(10, false); wait_ms(5); key(11, false);
    expect("同時押しで発動・最初のキーを離すと出力も離す", "+OUT0 -OUT0 ");

    key(10, true); wait_ms(100); key(10, false);
    expect("1 キーだけならタイムアウト後にそのキーとして流す", "+10 -10 ");

    key(10, true); wait_ms(5); key(12, true); key(12, false); key(10, false);
    expect("コンボ以外のキーが来たら順番どおりに流す", "+10 +12 -12 -10 ");

    key(10, true); wait_ms(5); key(10, false);
    expect("タイムアウト前に離したら流す", "+10 -10 ");

    highest_layer = 7; /* グループ 1 */
    key(20, true); key(21, true); key(20, false); key(21, false);
    expect("有効なレイヤー以外では発動しない", "+20 +21 -20 -21 ");
    highest_layer = 2; /* グループ 0 */
    key(20, true); key(21, true); key(20, false); key(21, false);
    expect("有効なレイヤーでは発動", "+OUT1 -OUT1 ");
    highest_layer = 0;

    key(30, true); key(31, true); key(31, false); key(30, false);
    expect("キー位置 31 (param2 側) を含むコンボ", "+OUT2 -OUT2 ");

    key(1, true); key(2, true); wait_ms(100); key(1, false); key(2, false);
    expect("短いコンボと長いコンボの候補: タイムアウトで短い方", "+OUT3 -OUT3 ");

    key(1, true); key(2, true); key(3, true); key(3, false); key(2, false); key(1, false);
    expect("3 キーそろえば長い方が即発動", "+OUT4 -OUT4 ");

    key(1, true); key(2, true); wait_ms(5); key(7, true); key(7, false); key(1, false); key(2, false);
    expect("成立済みのコンボ + 無関係なキー: コンボを発動してからキーを流す", "+OUT3 +7 -7 -OUT3 ");

    key(5, true); key(6, true); key(5, false); key(6, false);
    expect("未使用スロットは無視", "+5 +6 -5 -6 ");

    key(39, true); key(40, true); key(41, true); key(41, false); key(40, false); key(39, false);
    expect("3 キーのコンボ", "+OUT6 -OUT6 ");

    printf(failures ? "\n%d FAILED\n" : "\nALL PASSED\n", failures);
    return failures ? 1 : 0;
}
