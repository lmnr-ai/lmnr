import { addMonths, isBefore } from "date-fns";

/**
 * Calculate how many complete months have elapsed from startDate to endDate
 * This mimics Python's dateutil.relativedelta behavior and the Rust implementation
 *
 * @param startDate The starting date
 * @param endDate The ending date
 * @returns Number of complete months elapsed
 */
export function completeMonthsElapsed(startDate: Date, endDate: Date): number {
  let monthsElapsed = 0;

  // Always add months to the original startDate to avoid accumulating errors
  while (true) {
    const nextMonthDate = addMonths(startDate, monthsElapsed + 1);
    if (isBefore(nextMonthDate, endDate) || nextMonthDate.getTime() === endDate.getTime()) {
      monthsElapsed++;
    } else {
      break;
    }
  }

  return monthsElapsed;
}
