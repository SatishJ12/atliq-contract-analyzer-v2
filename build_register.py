"""Re-extract the commitment register from signed_contracts/ with an LLM on Groq.

The app ships with a human-verified register (commitment_register.json). This
script shows how that register is produced and kept current: the model reads each
signed contract and proposes obligation entries with verbatim quotes; quotes
that are not found in the source are dropped; a person reviews the output file
before it replaces the shipped register.

    export GROQ_API_KEY=...
    python build_register.py            # writes register_extracted.json
"""
from __future__ import annotations

import json
import sys

from analyzer import EXTRACT_MODEL, ReviewError, _llm_client, chat_json, quote_in_text
from data_loader import list_signed, read_text

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "obligations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {"type": "string", "enum": ["Non-compete", "Exclusivity", "Most-favoured-customer pricing (MFN)",
                                                        "IP assignment or licence", "Non-solicit / no-hire", "Data location / handling",
                                                        "Waiver", "Other restriction"]},
                    "binds": {"type": "string"},
                    "clause": {"type": "string"},
                    "quote": {"type": "string"},
                    "plain_english": {"type": "string"},
                    "duration": {"type": "string"},
                    "affiliates_bound": {"type": "boolean"},
                },
                "required": ["type", "binds", "clause", "quote", "plain_english", "duration", "affiliates_bound"],
            },
        }
    },
    "required": ["obligations"],
}

PROMPT = """From this signed contract, list every obligation that restricts what AtliQ (either AtliQ entity) may do in the future \
or what it has given away: non-competes, exclusivity, most-favoured pricing, IP assigned or retained by others, non-solicit/no-hire, \
data-location limits, waivers. Skip routine confidentiality, payment and liability terms. Quote each clause verbatim. \
If there are none, return an empty list.

<contract file="{name}">
{text}
</contract>"""


def main() -> int:
    client = _llm_client()
    out = []
    for path in list_signed():
        text = read_text(path)
        try:
            data = chat_json(client, EXTRACT_MODEL, "You extract obligations from signed contracts.",
                             PROMPT.format(name=path.name, text=text), SCHEMA, path.name)
        except ReviewError as exc:
            print(f"{path.name}: skipped ({exc})", file=sys.stderr)
            continue
        for ob in data["obligations"]:
            ob["source_file"] = path.name
            ob["quote_verified"] = quote_in_text(ob["quote"], text)
            out.append(ob)
        print(f"{path.name}: {sum(o['source_file'] == path.name for o in out)} obligations", file=sys.stderr)
    verified = [o for o in out if o["quote_verified"]]
    with open("register_extracted.json", "w", encoding="utf-8") as fh:
        json.dump(verified, fh, indent=2)
    print(f"Wrote {len(verified)} verified obligations ({len(out) - len(verified)} dropped for unverifiable quotes) "
          "to register_extracted.json. Review before merging into commitment_register.json.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
