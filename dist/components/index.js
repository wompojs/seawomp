/* Barrel: importing this module registers every built-in seawomp custom element as a side
 * effect. Apps that just want everything can do `import 'seawomp/components'`. The client
 * runtime also imports this so built-ins register on bootstrap. */
import './image.js';
import './link.js';
export { default as Link } from './link.js';
export { default as Image } from './image.js';
