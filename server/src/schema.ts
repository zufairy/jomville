import { MapSchema, Schema, type } from '@colyseus/schema';

export class Player extends Schema {
  @type('string') handle = '';
  @type('string') userId = ''; // public id, not the token
  @type('number') x = 0; // tile coords, fractional while walking
  @type('number') y = 0;
  @type('uint8') dir = 2; // 0=up 1=right 2=down 3=left
  @type('boolean') moving = false;
  @type('string') avatar = ''; // serialized AvatarConfig, validated server-side
  @type('boolean') voice = false; // proximity mic open
}

export class Furniture extends Schema {
  @type('string') def = '';
  @type('uint8') x = 0;
  @type('uint8') y = 0;
  @type('uint8') rot = 0;
  @type('boolean') on = true; // for usable items (lamps, tv...)
  @type('string') state = ''; // chance furni face: '0' closed, '-1' rolling, else result
  @type('string') itemId = ''; // instance item row; '' for commons and system décor
  @type('uint16') serial = 0; // LTD serial, 0 = none
}

export class WorldState extends Schema {
  @type('string') slug = '';
  @type('string') name = '';
  @type('string') category = 'hangout';
  @type('uint8') size = 10;
  @type('string') theme = 'indoor';
  @type('string') style = ''; // JSON RoomStyle
  @type('string') mask = ''; // rows joined by '|', empty = full square
  @type('string') ownerId = '';
  @type('string') ownerHandle = '';
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Furniture }) furniture = new MapSchema<Furniture>();
}
