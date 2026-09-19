class Snake {
  constructor() {
    this.reset();
  }

  reset() {
    this.body = [createVector(floor(w / 2), floor(h / 2))];
    this.xdir = 0;
    this.ydir = 0;
    this.len = 0;
  }

  setDir(x, y) {
    // Prevent an instant 180-degree turn.
    if (this.body.length > 1 && x === -this.xdir && y === -this.ydir) return;
    this.xdir = x;
    this.ydir = y;
  }

  update() {
    let head = this.body[this.body.length - 1].copy();
    head.x += this.xdir;
    head.y += this.ydir;

    if (this.body.length > 1) this.body.shift();
    this.body.push(head);
  }

  grow() {
    let head = this.body[this.body.length - 1].copy();
    this.len++;
    this.body.push(head);
  }

  endGame() {
    const head = this.body[this.body.length - 1];

    if (head.x > w - 1 || head.x < 0 || head.y > h - 1 || head.y < 0) {
      return true;
    }

    for (let i = 0; i < this.body.length - 1; i++) {
      if (this.body[i].x === head.x && this.body[i].y === head.y) {
        return true;
      }
    }
    return false;
  }

  eat(pos) {
    const head = this.body[this.body.length - 1];
    if (head.x === pos.x && head.y === pos.y) {
      this.grow();
      return true;
    }
    return false;
  }

  show() {
    noStroke();

    for (let i = 0; i < this.body.length; i++) {
      const part = this.body[i];
      const isHead = i === this.body.length - 1;

      drawingContext.shadowBlur = isHead ? 14 : 6;
      drawingContext.shadowColor = isHead ? '#eafff2' : '#39f58a';

      fill(isHead ? '#eafff2' : '#39f58a');
      rect(part.x + 0.06, part.y + 0.06, 0.88, 0.88, 0.18);
      drawingContext.shadowBlur = 0;

      if (isHead) {
        fill('#07120c');
        if (this.xdir !== 0) {
          ellipse(part.x + (this.xdir > 0 ? 0.67 : 0.33), part.y + 0.30, 0.12, 0.12);
          ellipse(part.x + (this.xdir > 0 ? 0.67 : 0.33), part.y + 0.70, 0.12, 0.12);
        } else {
          ellipse(part.x + 0.30, part.y + (this.ydir > 0 ? 0.67 : 0.33), 0.12, 0.12);
          ellipse(part.x + 0.70, part.y + (this.ydir > 0 ? 0.67 : 0.33), 0.12, 0.12);
        }
      }
    }
  }
}
