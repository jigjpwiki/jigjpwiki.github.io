const { validateTalents } = require("../../lib/talents"),
  { validateCatalog, publicCatalog } = require("../../lib/catalog"),
  { validateEvents } = require("../../lib/feature-data"),
  { validateMusic } = require("../../lib/music-data"),
  { validateKaraoke } = require("../../lib/karaoke-data");
module.exports = function validate(models, previous) {
  const t = validateTalents(models.talents, {
    root: "/",
    registry: models["talent-id-registry"],
    previous: previous?.talents,
  });
  const c = publicCatalog(
    validateCatalog(
      t,
      models.catalog,
      models.anniversaries,
      models.goods,
      models["catalog-id-registry"],
    ),
  );
  validateEvents(
    t,
    c,
    models.media,
    models.events,
    models["feature-id-registry"],
  );
  const m = validateMusic(
    t,
    c,
    models.media,
    models.music,
    models["feature-id-registry"],
  );
  validateKaraoke(m, models.karaoke, models["feature-id-registry"]);
  require("../../lib/talent-publication").assertPrivateUnreferenced(t,[models.catalog,models.anniversaries,models.events,models.music,models.karaoke,models.goods,models.media]);
  return true;
};
