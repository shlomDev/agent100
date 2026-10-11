"""Agent $100 — one run = one real job, charged against a $100 paper wallet.

Every call below is real and returns real data. The wallet is paper money:
each call is charged at an estimated x402 price (PRICES), and inference is
charged from real token usage at INFER_IN / INFER_OUT per million tokens.
Buyers are simulated (tagged sim) until real ones exist.

Runs on GitHub Actions; needs only the Python standard library.
Inference is free by default (GitHub Models). Optional: INFER_PROVIDER=anthropic + ANTHROPIC_API_KEY.
"""
import json, os, random, time, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, "data", "state.json")
START = 100.0
MODEL = os.environ.get("AGENT_MODEL", "claude-haiku-5-5")
GH_MODEL = os.environ.get("GH_MODEL") or "openai/gpt-4o-mini"
# Estimated per-call prices, in USD, for comparable x402 services.
PRICES = {"Hacker News search": 0.005, "GitHub search": 0.002, "Price feed": 0.001}
# Inference rates in USD per million tokens. Set these to your model's real pricing.
INFER_IN = float(os.environ.get("INFER_IN") or "1.0")
INFER_OUT = float(os.environ.get("INFER_OUT") or "5.0")
UA = {"User-Agent": "agent100/1.0"}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_json(url, headers=None, data=None):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


class Job:
    def __init__(self, state, title):
        self.s, self.w = state, state["wallet"]
        self.job = {"title": title, "startedAt": now(), "events": [], "output": ""}
        self.steps = []
        self.useful = False
        self.w["currentJob"] = {"n": self.w["jobsDone"] + 1, "title": title, "thought": "", "steps": self.steps}

    def think(self, text):
        self.w["currentJob"]["thought"] = text

    def _book(self, ev, delta):
        self.w["balance"] = round(self.w["balance"] + delta, 6)
        self.w["history"] = (self.w["history"] + [self.w["balance"]])[-300:]
        self.w["updatedAt"] = ev["t"]
        self.job["events"].append(ev)

    def call(self, service, endpoint, fn, price="est.", cost=None):
        endpoint = endpoint.replace("https://", "")
        """Run a real call. fn() returns (summary, url, useful, real_cost_or_None)."""
        step = {"name": service, "amt": "", "status": "now"}
        self.steps.append(step)
        try:
            summary, url, useful, real_cost = fn()
        except Exception as e:  # a failed call is never paid for
            step.update(status="done", amt="failed")
            self.job["events"].append({"t": now(), "kind": "call", "service": service, "method": "GET",
                                       "endpoint": endpoint, "cost": 0, "price": price, "ok": False,
                                       "result": f"Call failed, nothing paid: {e}"[:200]})
            return None
        c = real_cost if real_cost is not None else (cost if cost is not None else PRICES[service])
        step.update(status="done", amt=f"−${c:.4f}")
        self.w["spent"] = round(self.w["spent"] + c, 6)
        self.w["calls"] += 1
        if useful:
            self.useful = True
        else:
            self.w["wasted"] += 1
        self._book({"t": now(), "kind": "call", "service": service, "method": "POST" if "inference" in endpoint or "messages" in endpoint else "GET",
                    "endpoint": endpoint, "cost": c, "price": price, "ok": useful,
                    "result": summary[:240], "url": url}, -c)
        return summary

    def sell(self, product, unit_price, note_fmt):
        if not self.useful:
            self.steps.append({"name": f"Sell → {product}", "amt": "$0", "status": "done"})
            self.job["events"].append({"t": now(), "kind": "sale", "service": product, "amount": 0,
                                       "note": "Nothing useful came back, so there was nothing to sell."})
            return
        buyers = random.choices(range(0, 5), weights=[8, 3, 2, 1, 1])[0]  # simulated demand; most runs sell nothing
        amt = round(buyers * unit_price, 6)
        self.steps.append({"name": f"Sell → {product}", "amt": f"+${amt:.2f}", "status": "done"})
        if amt:
            self.w["earned"] = round(self.w["earned"] + amt, 6)
            self._book({"t": now(), "kind": "sale", "service": product, "amount": amt, "sim": True,
                        "note": note_fmt.format(n=buyers, p=unit_price)}, amt)
        else:
            self.job["events"].append({"t": now(), "kind": "sale", "service": product, "amount": 0, "sim": True,
                                       "note": "No buyers this time."})

    def finish(self, output):
        self.job["output"] = output
        self.w["jobsDone"] += 1
        self.s["jobs"] = ([self.job] + self.s["jobs"])[:15]


# ---- real data sources -------------------------------------------------------

def hn(query, hours=48):
    since = int(time.time()) - hours * 3600
    q = urllib.parse.urlencode({"query": query, "tags": "story", "numericFilters": f"created_at_i>{since}"})
    url = f"https://hn.algolia.com/api/v1/search_by_date?{q}"
    def fn():
        hits = get_json(url)["hits"][:8]
        lines = [h["title"] for h in hits]
        link = f"https://news.ycombinator.com/item?id={hits[0]['objectID']}" if hits else None
        return ("; ".join(lines) or "No stories found."), link, bool(hits), None
    return url, fn


def gh(query, days=7):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    q = urllib.parse.urlencode({"q": f"{query} pushed:>{since}", "sort": "stars", "per_page": 8})
    url = f"https://api.github.com/search/repositories?{q}"
    def fn():
        h = {"Accept": "application/vnd.github+json"}
        if os.environ.get("GITHUB_TOKEN"):
            h["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
        items = get_json(url, h)["items"]
        lines = [f"{i['full_name']} ★{i['stargazers_count']}" for i in items]
        return ("; ".join(lines) or "No repos found."), (items[0]["html_url"] if items else None), bool(items), None
    return url, fn


def prices():
    url = ("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,usd-coin"
           "&vs_currencies=usd&include_24hr_change=true")
    def fn():
        d = get_json(url)
        lines = [f"{k.upper()} ${v['usd']:,} ({v.get('usd_24h_change', 0):+.2f}%)" for k, v in d.items()]
        return "; ".join(lines), "https://www.coingecko.com/", bool(d), None
    return url, fn


def write(prompt):
    """Inference. Default: GitHub Models (free inside GitHub Actions via GITHUB_TOKEN).
    Set INFER_PROVIDER=anthropic and an ANTHROPIC_API_KEY secret to use Claude instead (paid)."""
    if os.environ.get("INFER_PROVIDER", "github") == "anthropic":
        url = "https://api.anthropic.com/v1/messages"
        def fn():
            key = os.environ.get("ANTHROPIC_API_KEY")
            if not key:
                raise RuntimeError("no ANTHROPIC_API_KEY secret set")
            body = json.dumps({"model": MODEL, "max_tokens": 500,
                               "messages": [{"role": "user", "content": prompt}]}).encode()
            r = get_json(url, {"x-api-key": key, "anthropic-version": "2023-06-01",
                               "content-type": "application/json"}, data=body)
            text = "".join(b.get("text", "") for b in r["content"]).strip()
            u = r["usage"]
            return text, None, bool(text), paper_cost(u["input_tokens"], u["output_tokens"])
        return url, fn

    url = "https://models.github.ai/inference/chat/completions"
    def fn():
        token = os.environ.get("GITHUB_TOKEN")
        if not token:
            raise RuntimeError("no GITHUB_TOKEN (runs only inside GitHub Actions)")
        body = json.dumps({"model": GH_MODEL, "max_tokens": 500,
                           "messages": [{"role": "user", "content": prompt}]}).encode()
        r = get_json(url, {"Authorization": "Bearer " + token, "Content-Type": "application/json",
                           "Accept": "application/vnd.github+json"}, data=body)
        text = (r["choices"][0]["message"]["content"] or "").strip()
        u = r.get("usage") or {}
        return text, None, bool(text), paper_cost(u.get("prompt_tokens", 0), u.get("completion_tokens", 0))
    return url, fn


def paper_cost(tokens_in, tokens_out):
    # Free for us, but the paper wallet is charged as if it bought these tokens.
    return round(tokens_in / 1e6 * INFER_IN + tokens_out / 1e6 * INFER_OUT, 6)


# ---- jobs --------------------------------------------------------------------

def job_news(state):
    j = Job(state, "Daily digest: AI-agent payments")
    j.think("Checking what people shipped and said about agent payments in the last 48 hours.")
    stories = j.call("Hacker News search", *hn("x402 OR \"agent payments\" OR \"agentic commerce\""))
    repos = j.call("GitHub search", *gh("x402"))
    j.think("Writing a five-line digest from what came back.")
    raw = f"Stories: {stories}\nRepos: {repos}"
    out = j.call("Inference", *write(
        "Write a 5-line plain-text digest for builders about AI-agent payments, using only these facts. "
        "No hype, no invented facts. If there is little news, say so.\n\n" + raw))
    j.sell("Daily digest", 0.05, "{n} subscribers paid ${p:.2f} each.")
    j.finish(out or raw)


def job_market(state):
    j = Job(state, "Market snapshot for agent wallets")
    j.think("Pulling live prices: BTC, ETH, SOL, and USDC's peg.")
    px = j.call("Price feed", *prices())
    j.think("Turning the numbers into a two-line note.")
    out = j.call("Inference", *write(
        "In two plain sentences, summarize these prices for an AI agent that holds USDC. "
        "Mention whether USDC is on its peg. No advice.\n\n" + str(px)))
    j.sell("Market note", 0.02, "{n} agents bought the note at ${p:.2f}.")
    j.finish(out or px or "")


def job_builders(state):
    j = Job(state, "Who is building the agent economy this week")
    j.think("Looking for fresh repos and launches around agent payments and paid MCP tools.")
    a = j.call("GitHub search", *gh("mcp payments"))
    b = j.call("GitHub search", *gh("agent wallet usdc"))
    c = j.call("Hacker News search", *hn("\"MCP\" paid OR payments", hours=72))
    j.think("Ranking what looks real versus what looks like a token wrapper.")
    raw = f"MCP payments repos: {a}\nAgent wallet repos: {b}\nHN: {c}"
    out = j.call("Inference", *write(
        "From these lists, name up to 4 projects worth watching and one line each on why. "
        "Plain text, skeptical tone, only what the data supports.\n\n" + raw))
    j.sell("Builders watchlist", 0.10, "{n} readers paid ${p:.2f}.")
    j.finish(out or raw)


JOBS = [job_news, job_market, job_builders]


def main():
    if os.path.exists(STATE):
        state = json.load(open(STATE))
    else:
        state = {"wallet": {}, "jobs": []}
    w = state["wallet"]
    for k, v in {"start": START, "balance": START, "spent": 0, "earned": 0, "calls": 0,
                 "wasted": 0, "jobsDone": 0, "history": [START], "updatedAt": now()}.items():
        w.setdefault(k, v)
    if w["balance"] <= 0:
        print("Wallet empty. The show is over.")
        return
    JOBS[w["jobsDone"] % len(JOBS)](state)
    with open(STATE, "w") as f:
        json.dump(state, f, indent=1)
    print(f"Balance ${w['balance']:.6f} after job #{w['jobsDone']}")


if __name__ == "__main__":
    main()
