import express from "express";

export const rawWebhookBody = express.raw({ type: "application/json", limit: "1mb" });
