// Screenshot staging for SOLARA.
// ?shot=cover|drive|mission|menu stages the matching scene, then the
// main loop paints twice and sets window.__shotReady.
// Staged scenes freeze the world so each screenshot is deterministic per seed.
export function stageShot(game, shot) {
  const g = game;
  if (shot === 'menu') {
    g.mode = 'menu';
    g.showMenu();
    return;
  }
  g.hideMenu();
  g.mode = 'playing';
  g.missions.index = 0;
  g.missions.state = 'idle';
  if (shot === 'cover') {
    // The money frame: a 5-star chase on Shoreline Drive at golden hour —
    // SOLARA AIR 1 overhead with its spotlight cone, police units flanking,
    // a roadblock ahead, a burning wreck and a fireball explosion on the
    // roadside, palms and beach umbrellas at right, the sun low over the sea.
    g.placePlayerInCar('SOLARA COMET GT', 270, -55, Math.PI);
    g.playerCar.speed = 24;
    g.shotDrive = true;
    g.shotLook = { ahead: 10, y: 4 }; // tilt up: the helicopter reads in frame
    g.police.heat = 88;
    g.police.wanted = 5;
    g.police.stageChase(270, -55, Math.PI);
    g.police.stageRoadblock(270, -55, Math.PI);
    g.spawnBurningWreck(278, -78);
    g.spawnExplosion(282, -92);
    g.missions.index = 8;
    g.missions.start();
    g.missions.timer = 41;
    g.hud.showDialog('LUZ MARÍN', 'FIXER — SOLARA',
      'Five stars, kid. SWAT is rolling. Forty-five seconds of hell — then you disappear.', 30);
    g.money = 24840;
    g.respect = 78;
    g.clockMinutes = 18 * 60 + 47;
  } else if (shot === 'drive') {
    // Cruising the coast road at golden hour, clean, radio on.
    g.placePlayerInCar('LUNA FALCON S', 270, 100, Math.PI);
    g.playerCar.speed = 24;
    g.shotDrive = true;
    g.police.heat = 0;
    g.police.wanted = 0;
    g.missions.index = 1;
    g.missions.start();
    g.missions.timer = 96;
    g.money = 8450;
    g.respect = 38;
    g.clockMinutes = 18 * 60 + 12;
    g.hud.showDialog('LUZ MARÍN', 'FIXER — SOLARA',
      'Case stays shut, car stays fast. Dock crew pays in cash, no questions. Move.', 30);
  } else if (shot === 'mission') {
    // On foot at the pier, checkpoint job in progress.
    g.placePlayerOnFoot(430, 0, Math.PI / 2);
    g.police.heat = 18;
    g.police.wanted = 1;
    g.missions.index = 2;
    g.missions.start();
    g.missions.timer = 142;
    g.money = 9200;
    g.respect = 45;
    g.clockMinutes = 18 * 60 + 30;
    g.hud.showDialog('LUZ MARÍN', 'FIXER — SOLARA',
      'On foot from here, kid. The pier is long and the wind is loud — perfect for a quiet handoff.', 30);
  }
  // Snap the chase camera into place and let the world settle before the shot.
  g.snapCamera();
  g.settleFrames = 14;
}
