"""
Job Efficiency Calculation Service

Calculates job efficiency, hours saved/lost, and money impact
for individual jobs, weekly reports, and monthly reports.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
import pytz


def calculate_job_efficiency(job_sheet: dict, quote_data: dict = None) -> dict:
    """
    Calculate efficiency metrics for a single job sheet.
    
    Args:
        job_sheet: Job sheet document from MongoDB
        quote_data: Optional quote data for hourly rate
    
    Returns:
        Dictionary with efficiency metrics
    """
    # Get estimated time (from old format or processes array)
    estimated_minutes = 0
    
    # Check processes array first (new format)
    if job_sheet.get('processes') and len(job_sheet.get('processes', [])) > 0:
        for process in job_sheet['processes']:
            setup = process.get('setup_time', 0) or 0
            time_per_part = process.get('time_per_part', 0) or 0
            quantity = job_sheet.get('quantity', 1)
            estimated_minutes += setup + (time_per_part * quantity)
    else:
        # Old format: use top-level fields
        setup_time = job_sheet.get('setup_time', 0) or 0
        number_of_bends = job_sheet.get('number_of_bends', 0) or 0
        time_per_bend = job_sheet.get('time_per_bend', 0) or 0
        packing_time = job_sheet.get('packing_time', 0) or 0
        quantity = job_sheet.get('quantity', 1)
        
        # Calculate bend time
        bend_time_per_part_seconds = number_of_bends * time_per_bend
        packing_time_per_part_seconds = packing_time
        time_per_part_minutes = (bend_time_per_part_seconds + packing_time_per_part_seconds) / 60.0
        estimated_minutes = setup_time + (time_per_part_minutes * quantity)
    
    # Get actual time
    actual_minutes = job_sheet.get('actual_time_taken', 0) or 0
    
    # If no actual time, check if we can calculate from start/end times
    if actual_minutes == 0 and job_sheet.get('started_at') and job_sheet.get('completed_at'):
        start = job_sheet['started_at']
        end = job_sheet['completed_at']
        if isinstance(start, str):
            start = datetime.fromisoformat(start.replace('Z', '+00:00'))
        if isinstance(end, str):
            end = datetime.fromisoformat(end.replace('Z', '+00:00'))
        actual_minutes = (end - start).total_seconds() / 60.0
    
    # Convert to hours
    estimated_hours = estimated_minutes / 60.0
    actual_hours = actual_minutes / 60.0
    
    # Calculate efficiency metrics
    hours_saved = estimated_hours - actual_hours
    
    # CORRECT FORMULA: Efficiency = (Estimated / Actual) × 100
    # If you finish in 0.1h when estimated was 0.3h = 300% efficiency (3x faster!)
    if actual_hours > 0:
        efficiency_percent = (estimated_hours / actual_hours) * 100
    else:
        efficiency_percent = 0
    
    # Get hourly rate for money calculation
    hourly_rate = job_sheet.get('hourly_rate', 0) or 0
    
    # If no rate in job sheet, try to get from quote
    if hourly_rate == 0 and quote_data:
        # Try to get from quote processes or use a default
        hourly_rate = quote_data.get('hourly_rate', 120)  # Default $120/hr
    
    if hourly_rate == 0:
        hourly_rate = 120  # Fallback default
    
    money_impact = hours_saved * hourly_rate
    
    return {
        'estimated_hours': round(estimated_hours, 2),
        'actual_hours': round(actual_hours, 2),
        'hours_saved': round(hours_saved, 2),
        'efficiency_percent': round(efficiency_percent, 1),
        'money_impact': round(money_impact, 2),
        'hourly_rate': hourly_rate
    }


def calculate_per_process_efficiency(processes: List[dict], quantity: int = 1) -> List[dict]:
    """
    Calculate efficiency for each process in a job sheet.
    
    Args:
        processes: List of process dictionaries with timing data
        quantity: Job quantity
    
    Returns:
        List of process efficiency metrics
    """
    results = []
    
    for process in processes:
        # Estimated time
        setup = process.get('setup_time', 0) or 0
        time_per_part = process.get('time_per_part', 0) or 0
        estimated_minutes = setup + (time_per_part * quantity)
        
        # Actual time
        actual_minutes = 0
        if process.get('actual_start_time') and process.get('actual_end_time'):
            start = process['actual_start_time']
            end = process['actual_end_time']
            
            if isinstance(start, str):
                start = datetime.fromisoformat(start.replace('Z', '+00:00'))
            if isinstance(end, str):
                end = datetime.fromisoformat(end.replace('Z', '+00:00'))
            
            actual_minutes = (end - start).total_seconds() / 60.0
        elif process.get('actual_time_minutes'):
            actual_minutes = process.get('actual_time_minutes', 0)
        
        # Convert to hours
        estimated_hours = estimated_minutes / 60.0
        actual_hours = actual_minutes / 60.0
        hours_saved = estimated_hours - actual_hours
        
        if actual_hours > 0:
            efficiency_percent = (estimated_hours / actual_hours) * 100
        else:
            efficiency_percent = 0
        
        # Get rate for this process
        hourly_rate = process.get('hourly_rate', 120)
        money_impact = hours_saved * hourly_rate
        
        results.append({
            'process_name': process.get('process_name', 'Unknown'),
            'estimated_hours': round(estimated_hours, 2),
            'actual_hours': round(actual_hours, 2),
            'hours_saved': round(hours_saved, 2),
            'efficiency_percent': round(efficiency_percent, 1),
            'money_impact': round(money_impact, 2),
            'operator_name': process.get('operator_name', '')
        })
    
    return results


def aggregate_efficiency_by_period(job_sheets: List[dict], period: str = 'week') -> dict:
    """
    Aggregate efficiency metrics for a time period.
    ONLY includes jobs with recorded start/end times.
    
    Args:
        job_sheets: List of completed job sheets
        period: 'week' or 'month'
    
    Returns:
        Aggregated efficiency metrics
    """
    total_estimated_hours = 0
    total_actual_hours = 0
    total_money_impact = 0
    jobs_count = 0
    
    # Per-process breakdown
    process_breakdown = {}
    
    for job in job_sheets:
        if job.get('status') != 'Completed':
            continue
        
        # SKIP jobs without times recorded
        if not job.get('started_at') or not job.get('completed_at'):
            continue
        
        # Calculate for this job
        efficiency = calculate_job_efficiency(job)
        
        # Skip if efficiency calculation failed or returned 0s
        if efficiency['actual_hours'] == 0:
            continue
        
        total_estimated_hours += efficiency['estimated_hours']
        total_actual_hours += efficiency['actual_hours']
        total_money_impact += efficiency['money_impact']
        jobs_count += 1
        
        # Process breakdown
        if job.get('processes'):
            process_efficiencies = calculate_per_process_efficiency(
                job['processes'],
                job.get('quantity', 1)
            )
            
            for proc_eff in process_efficiencies:
                proc_name = proc_eff['process_name']
                if proc_name not in process_breakdown:
                    process_breakdown[proc_name] = {
                        'estimated_hours': 0,
                        'actual_hours': 0,
                        'hours_saved': 0,
                        'money_impact': 0
                    }
                
                process_breakdown[proc_name]['estimated_hours'] += proc_eff['estimated_hours']
                process_breakdown[proc_name]['actual_hours'] += proc_eff['actual_hours']
                process_breakdown[proc_name]['hours_saved'] += proc_eff['hours_saved']
                process_breakdown[proc_name]['money_impact'] += proc_eff['money_impact']
    
    # Calculate overall metrics
    hours_saved = total_estimated_hours - total_actual_hours
    
    if total_actual_hours > 0:
        efficiency_percent = (total_estimated_hours / total_actual_hours) * 100
    else:
        efficiency_percent = 0
    
    # Calculate per-process efficiency percentages
    for proc_name in process_breakdown:
        proc_data = process_breakdown[proc_name]
        if proc_data['actual_hours'] > 0:
            proc_data['efficiency_percent'] = (proc_data['estimated_hours'] / proc_data['actual_hours']) * 100
        else:
            proc_data['efficiency_percent'] = 0
        
        # Round values
        proc_data['estimated_hours'] = round(proc_data['estimated_hours'], 2)
        proc_data['actual_hours'] = round(proc_data['actual_hours'], 2)
        proc_data['hours_saved'] = round(proc_data['hours_saved'], 2)
        proc_data['money_impact'] = round(proc_data['money_impact'], 2)
        proc_data['efficiency_percent'] = round(proc_data['efficiency_percent'], 1)
    
    return {
        'period': period,
        'jobs_completed': jobs_count,
        'total_estimated_hours': round(total_estimated_hours, 2),
        'total_actual_hours': round(total_actual_hours, 2),
        'hours_saved': round(hours_saved, 2),
        'efficiency_percent': round(efficiency_percent, 1),
        'money_impact': round(total_money_impact, 2),
        'process_breakdown': process_breakdown
    }


def get_date_range(period: str = 'week') -> tuple:
    """
    Get start and end dates for a period.
    
    Args:
        period: 'week' or 'month'
    
    Returns:
        Tuple of (start_date, end_date) as datetime objects
    """
    # Use Melbourne timezone
    tz = pytz.timezone('Australia/Melbourne')
    now = datetime.now(tz)
    
    if period == 'week':
        # Start of week (Monday)
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=7)
    else:  # month
        # Start of month
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # End of month
        if now.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    
    # Convert to UTC for database queries
    start_utc = start.astimezone(pytz.utc).replace(tzinfo=None)
    end_utc = end.astimezone(pytz.utc).replace(tzinfo=None)
    
    return start_utc, end_utc
