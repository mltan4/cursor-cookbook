#!/usr/bin/env node

import type { SDKMessage } from "@cursor/sdk"
import { mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

type CliOptions = {
  outputDir: string
  model: string
  force: boolean
  help: boolean
  extraInstructions: string
}

type TextBlock = {
  type: "text"
  text: string
}

type ToolBlock = {
  type: Exclude<string, "text">
  id?: string
  name?: string
  input?: unknown
}

const DEFAULT_MODEL = process.env.CURSOR_MODEL ?? "composer-2"
const DEFAULT_OUTPUT_DIR = "kanban-board"

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  const apiKey = process.env.CURSOR_API_KEY
  if (!apiKey) {
    throw new Error("Set CURSOR_API_KEY before running the Kanban board agent.")
  }

  const outputDir = path.resolve(options.outputDir)
  await prepareWorkspace(outputDir, options.force)

  const { Agent } = await import("@cursor/sdk")
  const agent = await Agent.create({
    apiKey,
    name: "Kanban board builder",
    model: { id: options.model },
    local: {
      cwd: outputDir,
    },
  })

  try {
    console.error(`[kanban-agent] workspace: ${outputDir}`)
    console.error(`[kanban-agent] model: ${options.model}`)

    const run = await agent.send(buildKanbanPrompt(options.extraInstructions), {
      model: { id: options.model },
      ...(options.force ? { local: { force: true } } : {}),
    })

    for await (const event of run.stream()) {
      renderSdkEvent(event)
    }

    const result = await run.wait()
    const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } })
      .usage
    console.error(
      [
        "[kanban-agent] result:",
        `status=${result.status}`,
        result.durationMs === undefined ? undefined : `duration=${formatDuration(result.durationMs)}`,
        usage?.inputTokens === undefined ? undefined : `input=${usage.inputTokens}`,
        usage?.outputTokens === undefined ? undefined : `output=${usage.outputTokens}`,
      ]
        .filter(Boolean)
        .join(" ")
    )
  } finally {
    await agent[Symbol.asyncDispose]()
  }
}

function parseArgs(argv: string[]): CliOptions {
  let outputDir = DEFAULT_OUTPUT_DIR
  let model = DEFAULT_MODEL
  let force = false
  let help = false
  const extraParts: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (index === 0 && arg === "--" && argv.length > 1) {
      continue
    }

    if (arg === "--") {
      extraParts.push(...argv.slice(index + 1))
      break
    }

    if (arg === "--help" || arg === "-h") {
      help = true
      continue
    }

    if (arg === "--force") {
      force = true
      continue
    }

    if (arg === "--output" || arg === "-o") {
      outputDir = readOptionValue(argv, index, arg)
      index += 1
      continue
    }

    if (arg.startsWith("--output=")) {
      outputDir = arg.slice("--output=".length)
      continue
    }

    if (arg === "--model" || arg === "-m") {
      model = readOptionValue(argv, index, arg)
      index += 1
      continue
    }

    if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length)
      continue
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`)
    }

    extraParts.push(arg, ...argv.slice(index + 1))
    break
  }

  return {
    outputDir,
    model,
    force,
    help,
    extraInstructions: extraParts.join(" ").trim(),
  }
}

function readOptionValue(argv: string[], index: number, option: string) {
  const value = argv[index + 1]
  if (!value || value.startsWith("-")) {
    throw new Error(`Expected a value after ${option}.`)
  }
  return value
}

async function prepareWorkspace(outputDir: string, force: boolean) {
  await mkdir(outputDir, { recursive: true })

  const entries = (await readdir(outputDir)).filter((entry) => entry !== ".DS_Store")
  if (entries.length > 0 && !force) {
    throw new Error(
      [
        `Output directory is not empty: ${outputDir}`,
        "Pass --force if you want the agent to work in this existing directory.",
      ].join("\n")
    )
  }
}

function buildKanbanPrompt(extraInstructions: string) {
  return [
    "Build a polished Kanban board web app in this workspace.",
    "",
    "Use this implementation brief:",
    "- Use Vite, React, and TypeScript.",
    "- Create a responsive board with columns for Todo, In Progress, Review, and Done.",
    "- Let users create, edit, delete, and move cards between columns.",
    "- Persist the board in localStorage and seed useful sample cards on first load.",
    "- Include clear empty states, accessible labels, keyboard-friendly controls, and a refined visual design.",
    "- Keep dependencies small and use ordinary package scripts: dev, build, and typecheck or lint.",
    "- Add a README that explains how to install, run, build, and use the board.",
    "- Validate the generated app with the available package manager and fix any issues you find.",
    "",
    "When you are done, summarize the generated files and the validation commands you ran.",
    extraInstructions ? ["", "Additional requirements from the user:", extraInstructions].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function renderSdkEvent(event: SDKMessage) {
  switch (event.type) {
    case "assistant":
      for (const block of event.message.content as Array<TextBlock | ToolBlock>) {
        if (isTextBlock(block)) {
          process.stdout.write(block.text)
        } else {
          annotate(
            `[tool] requested ${block.name ?? block.type}${summarizeToolInput(block.input)}`
          )
        }
      }
      break
    case "thinking": {
      const text = compactText(event.text)
      if (text) {
        annotate(`[thinking] ${text}`)
      }
      break
    }
    case "tool_call":
      annotate(`[tool] ${event.status} ${event.name}${summarizeToolInput(event.args)}`)
      break
    case "status":
      if (event.status !== "FINISHED") {
        annotate(`[status] ${event.status}${event.message ? ` ${event.message}` : ""}`)
      }
      break
    case "task":
      if (event.status || event.text) {
        annotate(`[task] ${compactText([event.status, event.text].filter(Boolean).join(" "))}`)
      }
      break
    default:
      break
  }
}

function isTextBlock(block: TextBlock | ToolBlock): block is TextBlock {
  return block.type === "text"
}

function summarizeToolInput(input: unknown) {
  if (!input || typeof input !== "object") {
    return ""
  }

  const record = input as Record<string, unknown>
  const parts = ["path", "file", "target_file", "command", "cmd", "pattern", "query"]
    .map((key) => formatToolPart(key, record[key]))
    .filter(Boolean)

  return parts.length > 0 ? ` (${parts.join(" ")})` : ""
}

function formatToolPart(key: string, value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return undefined
  }

  return `${key}=${shorten(String(value).replace(/\s+/g, " ").trim())}`
}

function compactText(text: string) {
  return shorten(text.replace(/\s+/g, " ").trim(), 120)
}

function shorten(value: string, maxLength = 80) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`
}

function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${ms}ms`
  }

  return `${(ms / 1000).toFixed(1)}s`
}

function annotate(message: string) {
  process.stderr.write(`${message}\n`)
}

function printHelp() {
  console.log(`Kanban Board Agent

Usage:
  pnpm dev -- [options] [extra requirements]

Options:
  -o, --output <dir>  Directory where the agent should create the app
                      (default: ${DEFAULT_OUTPUT_DIR})
  -m, --model <id>    Cursor model ID (default: CURSOR_MODEL or ${DEFAULT_MODEL})
      --force         Allow a non-empty output directory and local force mode
  -h, --help          Show this help message

Examples:
  pnpm dev
  pnpm dev -- --output ../my-kanban
  pnpm dev -- --output ../my-kanban -- "Add priority swimlanes and dark mode."
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
