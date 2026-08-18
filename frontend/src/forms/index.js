/**
 * Form templates registry.
 *
 * To add a new controlled form:
 *   1. Create a file in /forms (e.g. supplierEvaluation.js)
 *   2. Export an object with { id, form_no, title, group, description, render(footer) }
 *   3. Import + push into FORMS below
 *   4. (Recommended) Add the matching entry to the Document Control register
 *      so the printed footer auto-pulls Issue / Revision Date / Owner.
 */
import { employmentApplication } from './employmentApplication';

export const FORMS = [
  employmentApplication,
];

export const getFormById = (id) => FORMS.find((f) => f.id === id) || null;
