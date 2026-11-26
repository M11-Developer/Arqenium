export interface RecordInput {
  id: string;
  path: string;
  label?: string;
}

export class RecordFormatter {
  constructor(private readonly separator = ' :: ') {}

  format(input: RecordInput): string {
    return [input.id, input.path, input.label ?? 'unlabelled'].join(this.separator);
  }
}

const defaultFormatter = new RecordFormatter();

export function formatRecord(input: RecordInput): string {
  return defaultFormatter.format(input);
}
