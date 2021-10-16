import {
  parse,
  resolve,
  basename,
  extname,
  copy,
  walk,
  readLines,
  log,
  ensureDir,
} from "./deps.ts";
import type { Template } from "./types.ts";

import config from "./config.ts";
const { TEMPLATES_DIR, DEFAULT_FILENAME } = config;

export async function ask(question: string) {
  log.info(question);
  const { value } = await readLines(Deno.stdin).next();
  return value as string;
}

export function setDist(enteredDist: string) {
  const cwd = Deno.cwd();
  return enteredDist ? resolve(cwd, enteredDist) : cwd;
}

export async function setTemplates() {
  const availableFiles = [];
  for await (const file of walk(TEMPLATES_DIR)) {
    if (!file.isDirectory) availableFiles.push(file.path);
  }

  return availableFiles.map((f) => ({
    location: f,
    filename: basename(f),
    name: setTemplateName(f),
    extension: extname(f),
  })) as Template[];
}

export function setTemplateName(templateLocation: string) {
  return templateLocation
    .replace(TEMPLATES_DIR, "") // Remove the parent dir
    .replace(/\.[^.]+$/, "") // Remove extension
    .replace(/(\\(\\)?|\/)/g, "-") // Replace path separators with -
    .replace(/^-/, "") // Remove the front - left from trimming the parent dir
    .replace(`-${DEFAULT_FILENAME}`, ""); // Remove the default if it's the current template
}

export function checkIfTemplatesExists(
  templates: Template[],
  templateNames: string[]
) {
  return templateNames.every((tn) =>
    templates.find((temp) => temp.name === tn)
  );
}

export function getTemplates(
  templates: Template[],
  templateNames: (string | number)[]
) {
  return templateNames.map((tn) => {
    const template = templates.find((t) => t.name === tn);
    if (!template) {
      log.error(`Couldn't find "${tn}" template.`);
      Deno.exit(1);
    }

    return template;
  });
}

export async function copyTemplates(
  templates: Template[],
  dist: string,
  customDistName?: string
) {
  const distDir = resolve(dist);
  await ensureDir(distDir);

  let copiedCounter = 0;

  for (const template of templates) {
    const _dist = resolve(
      distDir,
      customDistName
        ? `${customDistName}.${template.extension}`
        : template.filename
    );

    try {
      await copy(template.location, _dist);
      copiedCounter++;
    } catch (e) {
      log.info(`Copied ${copiedCounter} template(s).`);
      log.error(e.message);
      Deno.exit(1);
    }
  }

  log.info(`Copied ${copiedCounter} template(s).`);
}

export async function promptForTemplates(templates: Template[]) {
  console.log("\nAvailable Templates:");
  templates.forEach((temp) => console.log(temp.name));
  console.log("");
  const neededTemplateNames = await ask("Enter template(s) name(s).");
  return neededTemplateNames
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x);
}

export function promptForDist() {
  return ask("Where to copy it (leave empty for current directory)?");
}

export function validateTemplates(
  templates: Template[],
  templateNames: string[]
) {
  if (templateNames.length === 0) {
    log.error("You have to enter a template name.");
    Deno.exit(1);
  }
  if (!checkIfTemplatesExists(templates, templateNames)) {
    log.error(`Can't find all the entered templates.`);
    Deno.exit(1);
  }
}

export async function retrieveData() {
  const templates = await setTemplates();

  let templateNames: string[];
  let _dist: string;

  const { _: clTemplateNames, dist: clDist, d } = parse(Deno.args);

  // == Setting up the needed templates == //
  templateNames = clTemplateNames.map((x) => x.toString());
  if (clTemplateNames.length === 0)
    templateNames = await promptForTemplates(templates);

  validateTemplates(templates, templateNames);

  // == Setting up the dist == //
  _dist = clDist || d;
  if (clTemplateNames.length === 0 && !clDist && !d)
    _dist = await promptForDist();
  _dist = setDist(_dist);

  return {
    dist: _dist,
    templateNames,
    templates: getTemplates(templates, templateNames),
  };
}
