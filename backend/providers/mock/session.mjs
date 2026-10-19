import { AppError } from '../../core/errors.mjs';
import { ok, mockRun } from '../contracts.mjs';

/** The session's deterministic providers: its drawing reader (the planner and speaker went with classic, v10). */
export function createSessionMocks({ clock, controls }) {
  /**
   * Deterministic drawing reader. controls.drawingReader: { transcription, mathLatex, confidence, uncertainRegions, fail }.
   * Default: reads the question's expected answer shape as "x = 3" with clear confidence.
   * Its shapes: controls.drawingShapes: { diagram, items, reading, uncertain, fail }. Default: no diagram.
   */
  const drawingReader = {
    async read(request) {
      const c = controls.drawingReader || {};
      if (c.fail) throw new AppError('provider_unavailable', 'drawing reader down');
      return ok({
        transcription: c.transcription ?? 'x = 3', mathLatex: c.mathLatex === undefined ? 'x = 3' : c.mathLatex,
        uncertainRegions: c.uncertainRegions ?? [], confidence: c.confidence ?? 'clear',
      }, { providerRuns: [mockRun('drawingReader', 'drawing_read_v1', clock)] });
    },
    async shapes() {
      const c = controls.drawingShapes || {};
      if (c.fail) throw new AppError('provider_unavailable', 'drawing reader down');
      return ok({ diagram: c.diagram ?? 'none', items: c.items ?? [], reading: c.reading ?? '', uncertain: c.uncertain ?? [] },
        { providerRuns: [mockRun('drawingReader', 'drawing_shapes_v1', clock)] });
    },
  };

  return { drawingReader };
}
