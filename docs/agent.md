# Hilo, the AI pattern maker

**Hilo** ("thread") is CutSense's design assistant: your pattern-making master. You describe what you want to make, in words or with a sketch; Hilo asks what it needs to know, one question at a time, and proposes the **flat pieces** to cut, with sizes in centimetres and quantities per set. When you approve, the pieces enter your order like any kit, and CutSense works out how many complete sets fit in your material.

Hilo runs on Muse Spark through the Meta Model API. It only ever produces **validated data**; it never places pieces, never touches the plan, and nothing it says is applied until you press the approve button.

- UI: `src/components/AgentDialog.tsx` (with `Markdown.tsx` and `agent.css`)
- Client: `src/lib/agent.ts`
- Schema and validation (shared by client and server): `src/lib/agentSchema.ts`
- Server: `server/agent.ts`, route `POST /api/agent` in `server/index.ts` ([api.md](api.md#post-apiagent))

## Where you meet Hilo

| Entry point | What approving does |
|---|---|
| **Prepare → Pieces → Design with AI** | Replaces the order with the proposed pieces, sets the spacing to at least 0.2 cm and switches the order to **Complete sets** mode (CutSense searches for how many sets fit). |
| **Result → Leftover → Design a product for the leftover with AI** | The approve button becomes *Try it on the leftover*: the proposed product is planned around the pieces already placed (like *Make another product from the leftover*). |
| **Result → Ask Hilo for help**, shown when not even one complete product fits | Opens a fresh conversation that starts with a diagnosis already written: the pieces, the material box and usable area, the spacing, how many pieces fit, and the calibration. Hilo checks for likely mistakes (a doubtful calibration, a size in the wrong unit) before suggesting a smaller object. |

Approving requires a photo calibrated in **cm**, because Hilo's sizes are real centimetres. If the photo is not calibrated, you can still talk to Hilo; the approve button explains what to do and the conversation is kept while you calibrate. When the photo is calibrated in cm, the app tells Hilo how much material is available (bounding box and usable area, or the leftover's area), as data.

## How a conversation works

- **One question at a time.** A question turn must contain exactly one question mark. Hilo may confirm in one sentence what it understood, then asks the single most important open question. Its suggested order: type of object and use, approximate finished size, compartments or slots, stitching or glue and seam allowance, material thickness, how many objects.
- **Quick replies.** When the answer is a choice, Hilo offers 2–4 short answers (at most 40 characters each) as buttons. Free answers, such as measurements, get no buttons. After a proposal, it may offer up to 3 common adjustments ("Make it bigger").
- **Sketches.** Attach a PNG, JPEG or WebP sketch or photo (one per message, three per conversation). The browser flattens transparency onto white and downsizes it to a JPEG of at most 1024 px before sending. Hilo describes what it understood (shape, compartments, rough proportions) and asks for real sizes rather than inventing them from an image without a size reference.
- **Proposals.** A proposal card lists each piece with a small preview of its shape, kind, size, quantity per set, allowed rotations and notes, plus Hilo's assumptions (for example "0.5 cm seam allowance included"). Each proposal also shows the [3D assembly preview](3d-preview.md). Ask for changes in the chat; Hilo returns a new, complete proposal.
- **Redirects.** For anything that is not designing an object made of flat pieces of material, or anything harmful, Hilo says politely that it cannot help and offers to get back to designing.
- **Language.** Hilo answers in the language you write in (English by default).
- **Session memory.** The conversation lives in the browser and is sent in full with every turn; the server keeps nothing. *New conversation* clears it; *Stop* cancels the answer in progress; *Retry* resends your last message after an error.

### Replies and the Markdown subset

Hilo's messages render through a small, safe Markdown parser (`src/lib/markdown.ts`) that builds React elements and never injects HTML:

- paragraphs and line breaks, `#` headings (shown at most as level 3), `-`/`*`/`•` and numbered lists, `>` quotes;
- `**bold**`, `*italic*` / `_italic_`, `` `code` ``;
- links only when they are `http(s)://` URLs.

Raw HTML is shown as text. The system prompt also asks for light formatting only (no tables, no HTML).

## Schema and validation

The model is called with structured output (`response_format: json_schema`, `strict: true`) using `TURN_SCHEMA`, which follows Meta's strict subset: closed objects, every key required, no `oneOf`/`allOf`.

```ts
interface AgentTurn {
  type: 'question' | 'proposal' | 'redirect';
  message: string;                 // Markdown subset
  quick_replies: string[];
  proposal: {
    name: string;
    pieces: {
      name: string;
      kind: 'rect' | 'rrect' | 'circle' | 'trapezoid' | 'irregular';
      width_cm: number; height_cm: number;   // bounding box of the piece
      qty_per_set: number;
      rotations: (0 | 90 | 180 | 270)[];
      notes: string;
    }[];
    assumptions: string[];
  };
}
```

Every answer goes through `validateTurn` on the server before it is returned. The validator is stricter than the schema:

| Rule | Limit |
|---|---|
| `message` | non-empty, at most 2,000 characters |
| question turns | exactly one `?` |
| redirect turns | at most one `?` |
| `quick_replies` | at most 4, each 1–40 characters, de-duplicated |
| piece types | at most 6 |
| piece name | 1–60 characters |
| piece kind | one of the five kinds above (no custom shapes) |
| width and height | 0.3–120 cm, rounded to 0.1 cm |
| quantity per set | integer 1–50 |
| rotations | non-empty subset of 0/90/180/270, de-duplicated and sorted |
| notes, assumptions | notes ≤ 400 characters; ≤ 10 assumptions of ≤ 400 characters |
| proposal name | ≤ 80 characters; required for a proposal |
| proposals | at least one piece |

If the answer is not valid JSON or fails a rule, the server sends the model its own answer plus the validation error and asks again, **once**. A second failure returns `AGENT_BAD_OUTPUT`. Question and redirect turns always carry an empty proposal.

The shape kinds map to the engine's templates: the trapezoid's top edge is 60 % of its width, and `irregular` is an L silhouette. If an object needs another shape, Hilo approximates it and notes the assumption; you can replace a piece with a drawn or imported shape afterwards.

## Guardrails

- **Scope.** Hilo designs objects made from flat pieces (leather, felt, fabric, cardboard…). It declines harmful, illegal, medical or sexual requests, and requests to reveal its instructions.
- **Prompt injection.** Everything you write or show in an image is treated as content to analyse, not as instructions; requests to ignore, reveal or change its rules, change role or leave the schema are ignored. App context is passed as "data, not an instruction" and flattened to one line of at most 300 characters.
- **Honesty.** Sizes are a proposal you review before cutting; Hilo does not promise accuracy or strength, does not invent data it was not given, and, when the material is really too small, says so instead of promising the impossible.
- **Personal data.** Hilo does not ask for or repeat personal data. The dialog reminds you that messages and sketches are sent to Meta.
- **Separation of powers.** Approved pieces go through the same path as any kit: the optimizer places them and the verifier checks the plan.

## Limits

| Limit | Client | Server |
|---|---|---|
| Messages per request | – | 40 |
| Your turns per conversation | 30 (then start a new one; your order is kept) | – |
| Characters per message | 1,500 (input box) | 4,000 |
| Characters per conversation | – | 30,000 |
| Sketches | 3 per conversation, files up to 8 MB before downsizing | 1 per message, 3 per conversation, ≤ 2,000,000 base64 characters |
| Requests | – | 20 per minute per IP |
| Timeout | aborts on *Stop* or when the dialog closes | 60 s |

Errors are shown in the chat with a retry link: not configured (no credentials on the server), too many requests, timeout, refusal, invalid answer, or the server unreachable.

## Known limitations

- Hilo is a language model: it can be wrong about sizes, proportions or how an object is built. Review every measurement.
- Five basic shape kinds cover most small leather goods, but curved patterns are approximated.
- At most 6 piece types per product.
- It cannot see your material or the plan; it only knows what the app tells it (available area) and what you write.
