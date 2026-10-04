/**
 * The profile frames that exist.
 *
 * There are 55 PNGs in `icons/frames/` (`pfp_frame_1.png` … `pfp_frame_55.png`)
 * on both platforms, and each platform used to enumerate them separately:
 *
 *   desktop   FRAME_NUMBERS = [1 … 55]        — all of them
 *   mobile    for (var fi = 0; fi <= 42; fi++) — stopped at 42
 *
 * So the phone silently offered 43 and never showed 43–55. Nobody noticed because
 * a picker that is missing its last twelve entries looks exactly like a picker
 * that ends there. One list now, read by both, so they cannot drift apart again.
 *
 * Frame 0 is not a frame — it is the "None" option the mobile picker draws, and
 * there is no `pfp_frame_0.png`.
 *
 * Add a frame by dropping the PNG into `icons/frames/` on BOTH platforms and
 * raising COUNT here. `mobile/tests/profile-frames.test.js` fails if the list and
 * the files disagree, so a mismatch cannot ship.
 */
(function (root) {
  var COUNT = 55;

  var numbers = [];
  for (var i = 1; i <= COUNT; i++) numbers.push(i);

  root.ProfileFrames = {
    /** How many frame images exist, 1-based. */
    COUNT: COUNT,
    /** [1, 2, … COUNT] — every frame number that has a file. */
    numbers: numbers,
    /** The file for a frame number, or null for 0 / anything out of range. */
    path: function (n) {
      var num = parseInt(n, 10);
      if (!num || num < 1 || num > COUNT) return null;
      return 'icons/frames/pfp_frame_' + num + '.png';
    },
    /** True when a number is a real frame rather than the "None" option. */
    isFrame: function (n) {
      var num = parseInt(n, 10);
      return !!num && num >= 1 && num <= COUNT;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
