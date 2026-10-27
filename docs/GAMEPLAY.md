# Gameplay and scoring

Aim from the emitter to a mirror. A receiver charges only while illuminated continuously for 800ms; interrupted charge resets, captured targets stay captured. Absorbing barriers block light. Win by charging every target and resolving all scheduled waves while integrity remains above zero. Lose at zero time or zero integrity. Pause freezes logical time and locks game commands.

| Mission        | Duration | Move budget | Targets | Solution                |
| -------------- | -------- | ----------- | ------- | ----------------------- |
| First light    | 75s      | 18          | 1       | Aim 0°, A −45°          |
| Chain reaction | 100s     | 24          | 2       | Aim 0°, A/B −45°        |
| Zero trust     | 120s     | 32          | 3       | Aim 0°, A/B −45°, C 45° |

A rotation is one move regardless of magnitude. Rotations must be nonzero multiples of 5° within ±45°. The UI defaults to ±15° buttons; chat accepts all valid steps. Once the budget is exhausted, aiming still works but mirror rotations are rejected.

| Simulated wave   | Window | Correct vote |
| ---------------- | ------ | ------------ |
| Phishing         | 2–9s   | quarantine   |
| Request burst    | 12–19s | shield       |
| Suspicious login | 22–29s | verify       |

Mission 1 includes the first wave, mission 2 the first two, mission 3 all three. One final vote per actor per wave. A strict unique plurality is required. A non-tied choice consumes one charge if available. Wrong choice, tie, no vote, or no charge causes 35 integrity damage and a 30-point penalty. Correct defense earns 150 points.

Score is `max(0, 300 × targets + 150 × defenses + min(100, 5 × contributors) − 4 × moves − 30 × breaches + win time bonus)`. The time bonus is `floor(remaining milliseconds / 100)` and applies only on a win. Participation counts unique actors who successfully rotate or vote, capped at 10,000.

Achievements: **Light keeper** for a win; **Zero breaches** for a win at 100 integrity; **Precision optics** for a win within twice the mirror count in moves; **Community powered** for at least three contributors. Reset starts a fresh round with no penalty carried over. Next is available only after a win, wraps mission 3 to mission 1, and clears previous participants/ballots.

Demo uses one actor per operator session. Twitch mode is fixed at round start; disconnecting does not relabel that round or let demo votes inflate a Twitch result. Reconnect Twitch or start a new demo round after disconnecting.
