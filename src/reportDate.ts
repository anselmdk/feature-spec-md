import { html } from "./html.js";

export function formatGeneratedAt(value: string | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value ?? "";
  const day = date.getDate();
  const month = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][date.getMonth()];
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}${ordinalSuffix(day)} ${month} ${date.getFullYear()} at ${hours}:${minutes}`;
}

export function renderGeneratedAt(value: string | undefined) {
  const timestamp = value ?? new Date().toISOString();
  return `data-generated-at="${html(timestamp)}"`;
}

function ordinalSuffix(day: number) {
  if (day >= 11 && day <= 13) return "th";
  if (day % 10 === 1) return "st";
  if (day % 10 === 2) return "nd";
  if (day % 10 === 3) return "rd";
  return "th";
}
