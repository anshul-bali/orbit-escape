# Orbit Escape

**Orbit. Fight. Launch. Survive.**

A neon space-survival arcade game built with vanilla JavaScript, HTML5 Canvas and CSS. Jump between planets, battle enemy ships, and balance fuel, shields and ammunition to keep your run alive.

## [Play Orbit Escape →](https://orbit-escape-eight.vercel.app)

Play directly in your browser on desktop or mobile.

## Gameplay

- Launch from orbit and navigate between planets.
- Visit friendly worlds to refuel and resupply.
- Fight enemy ships and turrets with cannons and lock-on missiles.
- Dodge asteroids and other hazards while managing hull, shields and fuel.
- Build your score and try to beat your personal best.
- Use keyboard and mouse on desktop, or on-screen touch controls on mobile.

**Watch your trajectory:** walls and planet cores end a run instantly.

## Controls

| Action | Desktop control |
| --- | --- |
| Start / launch from orbit | Space |
| Thrust | W, A, S, D |
| Fire cannon | E or left mouse button |
| Lock and fire missile | Hold M to lock, release to fire |
| Boost | Shift |
| Pause / resume | P or Esc |

On mobile, tap to launch and use the on-screen fire, missile and boost buttons. Sound can be toggled in the game interface.

## Built with

- **HTML5 Canvas 2D** for rendering the game world.
- **Vanilla JavaScript** for gameplay, physics, input and effects.
- **CSS** for the interface and responsive layout.
- **Browser local storage** for saved game preferences and records.
- **Vercel** for the live deployment.

No application framework or backend is required.

## Run locally

Clone this repository and serve its folder with a static web server. For example, with Git and Python 3 installed:

```sh
git clone https://github.com/anshul-bali/orbit-escape.git
cd orbit-escape
python -m http.server 8000
```

Then open [localhost:8000](http://localhost:8000) in your browser. Stop the server with Ctrl+C. There is no package installation or build step.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Game canvas, menus and HUD |
| `style.css` | Visual styling and responsive interface |
| `script.js` | Game loop, entities, combat, input, audio and effects |
| `vercel.json` | Hosting configuration |

## About the project

Created by **[Anshul Bali](https://github.com/anshul-bali)**, a first-year BE CSE student exploring web development, AI and cybersecurity. Orbit Escape is a hands-on project in interactive browser experiences, Canvas rendering and game logic.

## Feedback

Found a bug or have an idea? [Open an issue](https://github.com/anshul-bali/orbit-escape/issues) with what happened, steps to reproduce it, and your browser and device details.
