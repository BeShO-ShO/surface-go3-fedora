# Touchscreen misses taps (on the couch)

**Status:** ℹ️ Not a bug: grounding

Taps sometimes did nothing, mostly when using the device on a couch.

- Touchscreen: ELAN9038 `04F3:2A1C` (i2c, hid-multitouch). No kernel errors, only the harmless
  "IRQ triggered but there's no data".
- `libinput debug-events` showed the missed taps **never reached evdev**, so the controller
  didn't detect them at all.
- It's much better when held in hand or **touching the metal frame**. That points to grounding: a
  capacitive panel on a floating, ungrounded device loses sensitivity. Plugging in the charger helps for the same reason.

If dead spots stay in the same place no matter how you hold the device, suspect a digitizer hardware fault instead.
