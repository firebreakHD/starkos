export const STARK_DISPLAY_TOOLS = Object.freeze([
  {
    name: 'list_displays',
    description:
      'List paired displays, capabilities, connection state and current content.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'show_media',
    description: 'Show or transfer media on one or more paired displays.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['display_ids', 'media'],
      properties: {
        display_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
        mode: { type: 'string', enum: ['show', 'transfer'] },
        media: {
          type: 'object',
          required: ['title', 'type', 'data'],
          properties: {
            title: { type: 'string' },
            type: { type: 'string' },
            data: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'control_playback',
    description:
      'Pause, resume, seek, change volume or navigate a receiver queue.',
    inputSchema: {
      type: 'object',
      required: ['display_ids', 'command'],
      properties: {
        display_ids: { type: 'array', items: { type: 'string' } },
        command: {
          type: 'string',
          enum: ['pause', 'resume', 'seek', 'volume', 'next', 'previous'],
        },
        value: {},
        session_id: { type: 'string' },
      },
    },
  },
  {
    name: 'transform_image',
    description: 'Zoom, move, rotate or reset the current image.',
    inputSchema: {
      type: 'object',
      required: ['display_ids'],
      properties: {
        display_ids: { type: 'array', items: { type: 'string' } },
        session_id: { type: 'string' },
        reset: { type: 'boolean' },
        transform: {
          type: 'object',
          properties: {
            zoom: { type: 'number' },
            x: { type: 'number' },
            y: { type: 'number' },
            rotation: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'move_content',
    description:
      'Move or additionally show a live media session on other displays.',
    inputSchema: {
      type: 'object',
      required: ['source_display_id', 'target_display_ids'],
      properties: {
        source_display_id: { type: 'string' },
        target_display_ids: { type: 'array', items: { type: 'string' } },
        session_id: { type: 'string' },
        move: { type: 'boolean' },
      },
    },
  },
  {
    name: 'end_session',
    description:
      'End a presentation on one or more displays and return them to standby.',
    inputSchema: {
      type: 'object',
      required: ['display_ids'],
      properties: {
        display_ids: { type: 'array', items: { type: 'string' } },
        session_id: { type: 'string' },
      },
    },
  },
]);
