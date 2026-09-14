from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.checkin_definitions import CATEGORY_ORDER, QUESTIONS, questions_for_date
from app.schemas.report import (
    ComparisonValue, DailyBooleanValue, DailyCountValue, DailyMinutesValue, DailyNumberValue,
    DailyStatus, MonthlyBooleanMetric, MonthlyCareMetric, MonthlyCategoryCompletion,
    MonthlyDurationMetric, MonthlyPlannerSummary, MonthlyProgressResponse,
    MonthlyRatingMetric, MonthlyResponsibilitySummary, ReviewedReflection,
)
from app.services.note_analysis import normalize_sources, source_fingerprint
from app.services.weekly_report import NAP_METRIC_KEY, _load_week_data, rounded_average
from app.services.progress_cycles import cycle_bounds, cycle_for_date


def _direction(current: float | int | None, previous: float | int | None) -> tuple[float | int | None, str]:
    if current is None or previous is None: return None, "unavailable"
    difference = round(current - previous, 1)
    return difference, "unchanged" if difference == 0 else "increased" if difference > 0 else "decreased"


def _comparison(current: float | int | None, current_count: int, previous: float | int | None, previous_count: int) -> ComparisonValue:
    difference, direction = _direction(current, previous)
    return ComparisonValue(value=current, recorded_count=current_count, comparison_value=previous, comparison_recorded_count=previous_count, difference=difference, direction=direction)


def build_monthly_progress(
    session: Session,
    user_id: int,
    tracking_started_on: date,
    cycle_offset: int,
    *,
    today: date | None = None,
) -> MonthlyProgressResponse:
    today = today or date.today()
    current_offset, _, _ = cycle_for_date(tracking_started_on, today)
    start, end = cycle_bounds(tracking_started_on, cycle_offset)
    status = "previous" if cycle_offset < current_offset else "future" if cycle_offset > current_offset else "current"
    eligible_end = min(end, today) if status != "future" else start - timedelta(days=1)
    selected_dates = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    previous_period_start = None if cycle_offset == 0 else cycle_bounds(tracking_started_on, cycle_offset - 1)[0]
    if status == "future" or previous_period_start is None:
        comparison_start = comparison_end = None
    else:
        comparison_start, previous_end = cycle_bounds(tracking_started_on, cycle_offset - 1)
        comparison_end = min(previous_end, comparison_start + timedelta(days=(eligible_end - start).days))
    load_start = comparison_start or start; checkins, answers, naps, responsibilities, notes, analyses, tasks = _load_week_data(session, user_id, load_start, end)
    submitted = {item.id: item for item in checkins if item.status == "submitted" and item.local_date <= today}
    by_date = {item.local_date: item for item in submitted.values()}; answer_map: dict[int, dict[str, object]] = defaultdict(dict); nap_map: dict[int, list[object]] = defaultdict(list); responsibility_map: dict[int, list[object]] = defaultdict(list)
    for item in answers:
        if item.check_in_id in submitted: answer_map[item.check_in_id][item.question_key] = item
    for item in naps:
        if item.check_in_id in submitted: nap_map[item.check_in_id].append(item)
    for item in responsibilities:
        if item.check_in_id in submitted: responsibility_map[item.check_in_id].append(item)
    selected_recorded = {day: item for day, item in by_date.items() if start <= day <= eligible_end}
    comparison_dates = [] if comparison_start is None else [comparison_start + timedelta(days=i) for i in range((comparison_end - comparison_start).days + 1)]
    def numeric(day: date, key: str) -> float | None:
        item = by_date.get(day); answer = None if item is None else answer_map[item.id].get(key)
        return None if answer is None else answer.numeric_value
    def choices(day: date, key: str) -> str | None:
        item = by_date.get(day); answer = None if item is None else answer_map[item.id].get(key)
        return None if answer is None else answer.choice_value
    eligible_dates = [d for d in selected_dates if d <= today]; upcoming = [d for d in selected_dates if d > today]
    daily_status = [DailyStatus(date=d, status="upcoming" if d > today else "recorded" if d in selected_recorded else "no_check_in") for d in selected_dates]
    def values(key: str, dates: list[date], duration: bool = False) -> list[int | float | None]:
        result = []
        for d in dates:
            value = numeric(d, key)
            if key == "P1M" and value is None: value = None if numeric(d, "P1") is None else numeric(d, "P1") * 60
            result.append(None if value is None else int(round(value)) if duration else value)
        return result
    ratings = []
    for question in (q for q in QUESTIONS if q.kind == "rating"):
        current = values(question.key, selected_dates); previous = values(question.key, comparison_dates)
        current_numbers = [v for v in current if v is not None]; previous_numbers = [v for v in previous if v is not None]
        ratings.append(MonthlyRatingMetric(question_key=question.key, category=question.category, subcategory=question.subcategory, label=question.text, daily_values=[DailyNumberValue(date=d, value=v) for d, v in zip(selected_dates, current)], average=rounded_average(current_numbers), recorded_count=len(current_numbers), comparison=_comparison(rounded_average(current_numbers), len(current_numbers), rounded_average(previous_numbers), len(previous_numbers))))
    durations = []
    duration_questions = [q for q in QUESTIONS if q.kind in {"duration", "integer"}]
    for question in duration_questions:
        current = values(question.key, selected_dates, True); previous = values(question.key, comparison_dates, True); cv = [v for v in current if v is not None]; pv = [v for v in previous if v is not None]
        durations.append(MonthlyDurationMetric(metric_key=question.key, source_question_key=question.key, category=question.category, subcategory=question.subcategory, label=question.text, daily_values=[DailyMinutesValue(date=d, value=v) for d, v in zip(selected_dates, current)], total_minutes=sum(cv), average_minutes=None if not cv else round(sum(cv)/len(cv)), recorded_days=len(cv), comparison=_comparison(None if not cv else round(sum(cv)/len(cv)), len(cv), None if not pv else round(sum(pv)/len(pv)), len(pv))))
    def nap_values(dates: list[date]):
        result=[]
        for d in dates:
            item=by_date.get(d); choice=choices(d,"P3")
            result.append(None if item is None or choice not in {"Yes","No"} else 0 if choice == "No" else sum(n.duration_minutes for n in nap_map[item.id]))
        return result
    current, previous = nap_values(selected_dates), nap_values(comparison_dates); cv=[v for v in current if v is not None]; pv=[v for v in previous if v is not None]; p3=next(q for q in QUESTIONS if q.key=="P3")
    durations.append(MonthlyDurationMetric(metric_key=NAP_METRIC_KEY, source_question_key="P3", category=p3.category, subcategory=p3.subcategory, label="Daytime sleep or naps", daily_values=[DailyMinutesValue(date=d,value=v) for d,v in zip(selected_dates,current)], total_minutes=sum(cv), average_minutes=None if not cv else round(sum(cv)/len(cv)), recorded_days=len(cv), comparison=_comparison(None if not cv else round(sum(cv)/len(cv)),len(cv),None if not pv else round(sum(pv)/len(pv)),len(pv))))
    booleans=[]
    for q in (q for q in QUESTIONS if q.kind=="choice"):
        raw=[choices(d,q.key) for d in selected_dates]; old=[choices(d,q.key) for d in comparison_dates]; yes=sum(x=="Yes" for x in raw); no=sum(x=="No" for x in raw); old_yes=sum(x=="Yes" for x in old); old_count=sum(x in {"Yes","No"} for x in old); count=yes+no
        booleans.append(MonthlyBooleanMetric(question_key=q.key,category=q.category,subcategory=q.subcategory,label=q.text,daily_values=[DailyBooleanValue(date=d,value=True if x=="Yes" else False if x=="No" else None) for d,x in zip(selected_dates,raw)],yes_count=yes,no_count=no,recorded_count=count,not_applicable_count=sum(x in {"N/A","No spending"} for x in raw),yes_percentage=None if not count else round(yes/count*100,1),comparison=_comparison(None if not count else round(yes/count*100,1),count,None if not old_count else round(old_yes/old_count*100,1),old_count)))
    categories=[]
    for category in CATEGORY_ORDER:
        def completion(days):
            applicable=answered=complete=0
            for d in days:
                qs=[q for q in questions_for_date(d) if q.category==category and q.required]; applicable+=len(qs); item=by_date.get(d); answered += 0 if item is None else sum(q.key in answer_map[item.id] for q in qs); complete += item is not None and all(q.key in answer_map[item.id] for q in qs)
            return applicable,answered,complete
        a,b,c=completion(eligible_dates); oa,ob,_=completion(comparison_dates); categories.append(MonthlyCategoryCompletion(category=category,applicable_required_question_count=a,answered_required_question_count=b,completion_percentage=None if not a else round(b/a*100,1),completed_check_in_days=c,comparison=_comparison(None if not a else round(b/a*100,1),a,None if not oa else round(ob/oa*100,1),oa)))
    def responsibilities_for(days):
        vals=[len(responsibility_map[by_date[d].id]) for d in days if d in by_date]; return sum(vals),sum(v>0 for v in vals),len(vals)
    total,days_with,recorded=responsibilities_for(eligible_dates); old_total,_,old_recorded=responsibilities_for(comparison_dates)
    responsibility_summary=MonthlyResponsibilitySummary(daily_counts=[DailyCountValue(date=d,value=None if d not in selected_recorded else len(responsibility_map[selected_recorded[d].id])) for d in selected_dates],weekly_total=total,recorded_days=recorded,days_with_entries=days_with,average_per_recorded_check_in_day=None if not recorded else round(total/recorded,1),comparison=_comparison(None if not recorded else round(total/recorded,1),recorded,None if not old_recorded else round(old_total/old_recorded,1),old_recorded))
    def care(key):
        q=next(x for x in QUESTIONS if x.key==key); applicable=[d for d in selected_dates if not q.weekdays or d.weekday() in q.weekdays]; old_applicable=[d for d in comparison_dates if not q.weekdays or d.weekday() in q.weekdays]; raw=[choices(d,key) if d in applicable else None for d in selected_dates]; old=[choices(d,key) if d in old_applicable else None for d in comparison_dates]; yes=sum(x=="Yes" for x in raw); count=sum(x in {"Yes","No"} for x in raw); old_yes=sum(x=="Yes" for x in old); old_count=sum(x in {"Yes","No"} for x in old)
        return MonthlyCareMetric(question_key=key,label=q.text,applicable_dates=applicable,daily_values=[],yes_count=yes,no_count=sum(x=="No" for x in raw),recorded_count=count,applicable_elapsed_days=sum(d<=today for d in applicable),percentage=None if not count else round(yes/count*100,1),comparison=_comparison(None if not count else round(yes/count*100,1),count,None if not old_count else round(old_yes/old_count*100,1),old_count))
    moisturizer, treatments=care("SC1"),[care("SC2"),care("SC3")]
    selected_tasks=[t for t in tasks if start<=t.task_date<=eligible_end]; old_tasks=[t for t in tasks if comparison_start and comparison_start<=t.task_date<=comparison_end]; completed=sum(t.is_completed for t in selected_tasks); old_completed=sum(t.is_completed for t in old_tasks); percent=None if not selected_tasks else round(completed/len(selected_tasks)*100,1); old_percent=None if not old_tasks else round(old_completed/len(old_tasks)*100,1)
    planner=MonthlyPlannerSummary(total_planned_tasks=len(selected_tasks),completed_tasks=completed,incomplete_tasks=len(selected_tasks)-completed,completion_percentage=percent,daily=[],tasks_per_eligible_day=None if not eligible_dates else round(len(selected_tasks)/len(eligible_dates),1),comparison=_comparison(percent,len(selected_tasks),old_percent,len(old_tasks)))
    notes_map:dict[int,list[tuple[str,str]]]=defaultdict(list)
    for n in notes: notes_map[n.check_in_id].append((n.category,n.note))
    reflections=[]; outdated=0
    for analysis in analyses:
        if not(start<=analysis.local_date<=eligible_end): continue
        if analysis.source_fingerprint != source_fingerprint(normalize_sources(notes_map[analysis.check_in_id])): outdated+=1; continue
        reflections.append(ReviewedReflection(local_date=analysis.local_date,summary=analysis.summary,positive_actions=analysis.positive_actions,challenges=analysis.challenges,possible_improvements=analysis.possible_improvements,themes=analysis.themes,reflection_question=analysis.reflection_question))
    label = "No previous progress cycle available." if comparison_start is None else f"{start:%B} {start.day}–{eligible_end.day}, {start.year} compared with {comparison_start:%B} {comparison_start.day}–{comparison_end.day}, {comparison_start.year}"
    return MonthlyProgressResponse(tracking_started_on=tracking_started_on,period_start=start,period_end=end,period_status=status,previous_period_start=previous_period_start,next_period_start=cycle_bounds(tracking_started_on, cycle_offset + 1)[0],has_previous_period=previous_period_start is not None,comparison_period_start=comparison_start,comparison_period_end=comparison_end,comparison_label=label,daily_status=daily_status,recorded_check_in_days=len(selected_recorded),eligible_elapsed_days=len(eligible_dates),total_month_days=len(selected_dates),missing_elapsed_dates=[d for d in eligible_dates if d not in selected_recorded],upcoming_dates=upcoming,category_completion_summaries=categories,rating_metrics=ratings,duration_metrics=durations,boolean_metrics=booleans,responsibility_counts=responsibility_summary,daily_moisturizer_consistency=moisturizer,scheduled_care_consistency=treatments,planner_summary=planner,reviewed_reflections=reflections,outdated_accepted_analysis_count=outdated)
