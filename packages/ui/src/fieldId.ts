/**
 * The id a `Field`'s label points at.
 *
 * `Field` renders `<label htmlFor={id}>`, and the control it labels has to
 * carry that same id or the label names nothing: the screen reader announces
 * an unlabelled box, and clicking the text does not focus the field. Twenty-one
 * of the fields in this system had exactly that, because the association was
 * left to each caller to remember and it is the kind of thing a caller forgets.
 *
 * So the id travels down instead. A control that was given an id of its own
 * keeps it — the caller had a reason — and one that was not takes the field's.
 *
 * The context lives here rather than beside `Field` because the controls that
 * read it are atoms, and an atom may not import a molecule.
 *
 * One control per field. A `Field` wrapping two inputs would give them the
 * same id; put each in a field of its own, or pass `htmlFor` and matching ids
 * explicitly.
 */

import { createContext, useContext } from 'react';

export const FieldIdContext = createContext<string | null>(null);

/** The id the surrounding `Field` labels, if there is one. */
export function useFieldId(): string | null {
  return useContext(FieldIdContext);
}

/** The id a control should render with: its own if it has one, else the field's. */
export function useControlId(own: string | undefined): string | undefined {
  const field = useFieldId();
  return own ?? field ?? undefined;
}
