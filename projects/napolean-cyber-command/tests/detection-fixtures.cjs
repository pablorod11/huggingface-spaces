'use strict';
// Original fixtures; counts describe nominations, never exploit validation.
module.exports = [
  {name:'direct dynamic evaluation',source:'eval(user_input)',expected:1},
  {name:'multiline dynamic evaluation',source:'exec(\n user_input\n)',expected:1},
  {name:'direct subprocess shell flag',source:'import subprocess\nsubprocess.run(command, shell=True)',expected:1},
  {name:'module alias multiline shell flag',source:'import subprocess as sp\nsp.run(\n command,\n # explanation\n shell=True\n)',expected:1},
  {name:'function import alias',source:'from subprocess import run as launch\nlaunch(command, shell=True)',expected:1},
  {name:'parenthesized imports',source:'from subprocess import (\n run as launch,\n check_output\n)\nlaunch(command, shell=True)',expected:1},
  {name:'secret assignment literal',source:'api_key = "synthetic-placeholder-123"',expected:1},
  {name:'comment is not code',source:'# eval(user_input)\n# subprocess.run(cmd, shell=True)\n# api_key = "synthetic-secret"',expected:0},
  {name:'quoted code is not a call',source:'example = "eval(user_input)"\nother = \'subprocess.run(cmd, shell=True)\'',expected:0},
  {name:'triple quoted example',source:'text = """\neval(user_input)\nsubprocess.run(cmd, shell=True)\n"""',expected:0},
  {name:'shell False',source:'import subprocess as sp\nsp.run(command, shell=False)',expected:0},
  {name:'quoted True is not Boolean',source:'subprocess.run(command, shell="True")',expected:0},
  {name:'nested unrelated shell argument',source:'subprocess.run(wrapper(shell=True))',expected:0},
  {name:'unrelated object method',source:'object.eval(user_input)\nother.run(command,shell=True)',expected:0},
  {name:'function declaration',source:'def eval(value):\n return value',expected:0},
  {name:'escaped quote followed by real call',source:'example = "escaped \\" eval(ignored)"\neval(user_input)',expected:1},
  {name:'nested dynamic call',source:'print(eval(user_input))',expected:1},
  {name:'nested subprocess sink',source:'wrapper(subprocess.run(command, shell=True))',expected:1},
];
