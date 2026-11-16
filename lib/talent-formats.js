"use strict";
const date = (value) =>
  /^\d{4}-\d\d-\d\d$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const publicUrl = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ![...url.searchParams.keys()].some((k) =>
        /key|token|password|secret|auth/i.test(k),
      )
    );
  } catch {
    return false;
  }
};
const dateTime = (value) =>
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) &&
  date(value.slice(0, 10)) &&
  Number.isFinite(Date.parse(value));
const imageRef = (value) =>
  publicUrl(value) ||
  (/^\/assets\/[a-zA-Z0-9_./-]+\.(?:png|svg|webp|jpg)$/.test(value) &&
    !value.split("/").some((p) => p === ".." || p === "."));
module.exports = { date, publicUrl, dateTime, imageRef };
