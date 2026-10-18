"""Comparing analyzer output with verified tagging. Pure functions."""

from dataclasses import dataclass

MATCH_IOU = 0.3  # auto rallies carry lead/tail margins, so overlap is judged leniently


def iou(a: tuple[float, float], b: tuple[float, float]) -> float:
    inter = max(0.0, min(a[1], b[1]) - max(a[0], b[0]))
    union = max(a[1], b[1]) - min(a[0], b[0])
    return inter / union if union > 0 else 0.0


def match_intervals(pred: list[tuple[float, float]], gt: list[tuple[float, float]]) -> list[tuple[int, int]]:
    """Greedy one-to-one matching by IoU."""
    pairs = sorted(((iou(p, g), i, j) for i, p in enumerate(pred) for j, g in enumerate(gt)), reverse=True)
    used_p, used_g, out = set(), set(), []
    for score, i, j in pairs:
        if score < MATCH_IOU:
            break
        if i in used_p or j in used_g:
            continue
        used_p.add(i)
        used_g.add(j)
        out.append((i, j))
    return out


def lcs(a: list[str], b: list[str]) -> int:
    """Longest common subsequence: how many touches were labeled right, in the right order."""
    dp = [0] * (len(b) + 1)
    for x in a:
        prev = 0
        for j, y in enumerate(b, 1):
            cur = dp[j]
            dp[j] = prev + 1 if x == y else max(dp[j], dp[j - 1])
            prev = cur
    return dp[-1]


@dataclass
class Score:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    start_err: float = 0.0
    end_err: float = 0.0
    skills_matched: int = 0
    skills_predicted: int = 0
    skills_true: int = 0

    def add(self, other: "Score") -> None:
        for k in vars(self):
            setattr(self, k, getattr(self, k) + getattr(other, k))

    def summary(self) -> dict:
        def ratio(a: float, b: float) -> float | None:
            return round(a / b, 3) if b else None

        precision, recall = ratio(self.tp, self.tp + self.fp), ratio(self.tp, self.tp + self.fn)
        f1 = round(2 * precision * recall / (precision + recall), 3) if precision and recall else 0.0
        sp, sr = ratio(self.skills_matched, self.skills_predicted), ratio(self.skills_matched, self.skills_true)
        return {
            "rallies_true": self.tp + self.fn,
            "rallies_found": self.tp,
            "rallies_false": self.fp,
            "rally_precision": precision,
            "rally_recall": recall,
            "rally_f1": f1,
            "start_error_s": ratio(self.start_err, self.tp),
            "end_error_s": ratio(self.end_err, self.tp),
            "action_precision": sp,
            "action_recall": sr,
            "action_f1": round(2 * sp * sr / (sp + sr), 3) if sp and sr else 0.0,
        }

    def objective(self) -> float:
        s = self.summary()
        boundary = (s["start_error_s"] or 0) + (s["end_error_s"] or 0)
        return s["rally_f1"] + 0.5 * s["action_f1"] - 0.01 * boundary


def score_set(
    pred_rallies: list[tuple[float, float]],
    pred_skills: list[list[str]],
    gt_rallies: list[tuple[float, float]],
    gt_skills: list[list[str]],
) -> Score:
    pairs = match_intervals(pred_rallies, gt_rallies)
    s = Score(tp=len(pairs), fp=len(pred_rallies) - len(pairs), fn=len(gt_rallies) - len(pairs))
    for i, j in pairs:
        s.start_err += abs(pred_rallies[i][0] - gt_rallies[j][0])
        s.end_err += abs(pred_rallies[i][1] - gt_rallies[j][1])
        s.skills_matched += lcs(pred_skills[i], gt_skills[j])
        s.skills_predicted += len(pred_skills[i])
        s.skills_true += len(gt_skills[j])
    # Touches in missed rallies count as missed; in false rallies as wrong
    s.skills_true += sum(len(gt_skills[j]) for j in set(range(len(gt_rallies))) - {j for _, j in pairs})
    s.skills_predicted += sum(len(pred_skills[i]) for i in set(range(len(pred_rallies))) - {i for i, _ in pairs})
    return s
