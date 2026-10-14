#!/usr/bin/env node
// Aponta o git para .githooks/ (roda no "prepare" do npm install).
// Fora de um repositorio git (ex.: build Docker) nao faz nada.
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
} catch {
  // sem git ou sem repositorio: nada a ativar
}
