// scripts/gen-keycodes.py と同様に ZMK v0.2.1 の dt-bindings ヘッダ (MIT License) から抽出した #define 群。
// キーマップ中のパラメータ (BT_SEL 0, RGB_TOG, SCRL_UP など) を評価するために使います。
export const ZMK_HEADER_DEFINES = String.raw`
// ---- dt-bindings/zmk/modifiers.h
#define MOD_LCTL 0x01
#define MOD_LSFT 0x02
#define MOD_LALT 0x04
#define MOD_LGUI 0x08
#define MOD_RCTL 0x10
#define MOD_RSFT 0x20
#define MOD_RALT 0x40
#define MOD_RGUI 0x80
#define SELECT_MODS(keycode) (keycode >> 24)
#define STRIP_MODS(keycode) (keycode & ~(0xFF << 24))
#define APPLY_MODS(mods, keycode) (mods << 24 | keycode)
#define LC(keycode) APPLY_MODS(MOD_LCTL, keycode)
#define LS(keycode) APPLY_MODS(MOD_LSFT, keycode)
#define LA(keycode) APPLY_MODS(MOD_LALT, keycode)
#define LG(keycode) APPLY_MODS(MOD_LGUI, keycode)
#define RC(keycode) APPLY_MODS(MOD_RCTL, keycode)
#define RS(keycode) APPLY_MODS(MOD_RSFT, keycode)
#define RA(keycode) APPLY_MODS(MOD_RALT, keycode)
#define RG(keycode) APPLY_MODS(MOD_RGUI, keycode)
// ---- dt-bindings/zmk/bt.h
#define BT_CLR_CMD 0
#define BT_NXT_CMD 1
#define BT_PRV_CMD 2
#define BT_SEL_CMD 3
#define BT_CLR_ALL_CMD 4
#define BT_DISC_CMD 5
#define BT_CLR BT_CLR_CMD 0
#define BT_NXT BT_NXT_CMD 0
#define BT_PRV BT_PRV_CMD 0
#define BT_SEL BT_SEL_CMD
#define BT_CLR_ALL BT_CLR_ALL_CMD 0
#define BT_DISC BT_DISC_CMD
// ---- dt-bindings/zmk/outputs.h
#define OUT_TOG 0
#define OUT_USB 1
#define OUT_BLE 2
// ---- dt-bindings/zmk/ext_power.h
#define EXT_POWER_OFF_CMD 0
#define EXT_POWER_ON_CMD 1
#define EXT_POWER_TOGGLE_CMD 2
#define EP_ON EXT_POWER_ON_CMD
#define EP_OFF EXT_POWER_OFF_CMD
#define EP_TOG EXT_POWER_TOGGLE_CMD
// ---- dt-bindings/zmk/rgb.h
#define RGB_TOG_CMD 0
#define RGB_ON_CMD 1
#define RGB_OFF_CMD 2
#define RGB_HUI_CMD 3
#define RGB_HUD_CMD 4
#define RGB_SAI_CMD 5
#define RGB_SAD_CMD 6
#define RGB_BRI_CMD 7
#define RGB_BRD_CMD 8
#define RGB_SPI_CMD 9
#define RGB_SPD_CMD 10
#define RGB_EFF_CMD 11
#define RGB_EFR_CMD 12
#define RGB_EFS_CMD 13
#define RGB_COLOR_HSB_CMD 14
#define RGB_TOG RGB_TOG_CMD 0
#define RGB_ON RGB_ON_CMD 0
#define RGB_OFF RGB_OFF_CMD 0
#define RGB_HUI RGB_HUI_CMD 0
#define RGB_HUD RGB_HUD_CMD 0
#define RGB_SAI RGB_SAI_CMD 0
#define RGB_SAD RGB_SAD_CMD 0
#define RGB_BRI RGB_BRI_CMD 0
#define RGB_BRD RGB_BRD_CMD 0
#define RGB_SPI RGB_SPI_CMD 0
#define RGB_SPD RGB_SPD_CMD 0
#define RGB_EFF RGB_EFF_CMD 0
#define RGB_EFR RGB_EFR_CMD 0
#define RGB_COLOR_HSB_VAL(h, s, v) (((h) << 16) + ((s) << 8) + (v))
#define RGB_COLOR_HSB(h, s, v) RGB_COLOR_HSB_CMD##(RGB_COLOR_HSB_VAL(h, s, v))
#define RGB_COLOR_HSV RGB_COLOR_HSB
// ---- dt-bindings/zmk/backlight.h
#define BL_ON_CMD 0
#define BL_OFF_CMD 1
#define BL_TOG_CMD 2
#define BL_INC_CMD 3
#define BL_DEC_CMD 4
#define BL_CYCLE_CMD 5
#define BL_SET_CMD 6
#define BL_ON BL_ON_CMD 0
#define BL_OFF BL_OFF_CMD 0
#define BL_TOG BL_TOG_CMD 0
#define BL_INC BL_INC_CMD 0
#define BL_DEC BL_DEC_CMD 0
#define BL_CYCLE BL_CYCLE_CMD 0
#define BL_SET BL_SET_CMD
// ---- dt-bindings/zmk/pointing.h
#define MB1 BIT(0)
#define LCLK (MB1)
#define MB2 BIT(1)
#define RCLK (MB2)
#define MB3 BIT(2)
#define MCLK (MB3)
#define MB4 BIT(3)
#define MB5 BIT(4)
#define ZMK_POINTING_DEFAULT_MOVE_VAL 600
#define ZMK_POINTING_DEFAULT_SCRL_VAL 10
#define MOVE_Y(vert) ((vert) & 0xFFFF)
#define MOVE_Y_DECODE(encoded) (int16_t)((encoded) & 0x0000FFFF)
#define MOVE_X(hor) (((hor) & 0xFFFF) << 16)
#define MOVE_X_DECODE(encoded) (int16_t)(((encoded) & 0xFFFF0000) >> 16)
#define MOVE(hor, vert) (MOVE_X(hor) + MOVE_Y(vert))
#define MOVE_UP MOVE_Y(-ZMK_POINTING_DEFAULT_MOVE_VAL)
#define MOVE_DOWN MOVE_Y(ZMK_POINTING_DEFAULT_MOVE_VAL)
#define MOVE_LEFT MOVE_X(-ZMK_POINTING_DEFAULT_MOVE_VAL)
#define MOVE_RIGHT MOVE_X(ZMK_POINTING_DEFAULT_MOVE_VAL)
#define SCRL_UP MOVE_Y(ZMK_POINTING_DEFAULT_SCRL_VAL)
#define SCRL_DOWN MOVE_Y(-ZMK_POINTING_DEFAULT_SCRL_VAL)
#define SCRL_LEFT MOVE_X(-ZMK_POINTING_DEFAULT_SCRL_VAL)
#define SCRL_RIGHT MOVE_X(ZMK_POINTING_DEFAULT_SCRL_VAL)
// ---- dt-bindings/zmk/reset.h
#define RST_WARM 0x00
#define RST_COLD 0x01
#define RST_UF2 0x57
`;
