import { Component, createRef, type ReactNode } from 'react';

interface ResultProps {
  variantId: string | number | undefined;
  children: ReactNode;
}
interface ResultLayer { id: number; content: ReactNode }
interface ResultState {
  variantId: ResultProps['variantId'];
  current: ResultLayer;
  outgoing: ResultLayer[];
}

// Measured from the reference canvas pixels, independently of the thumbnail
// layout animation: a 320ms ease-in-out cubic crossfade between opaque images.
const crossfadeFrames = Array.from({ length: 33 }, (_, index) => {
  const time = index / 32;
  return { offset: time, opacity: time < .5 ? 4 * time ** 3 : 1 - (-2 * time + 2) ** 3 / 2 };
});

export class ImagePromptResult extends Component<ResultProps, ResultState> {
  state: ResultState = {
    variantId: this.props.variantId,
    current: { id: 0, content: this.props.children },
    outgoing: [],
  };
  private root = createRef<HTMLDivElement>();
  private animation: Animation | undefined;
  private reduced: MediaQueryList | undefined;

  static getDerivedStateFromProps(props: ResultProps, state: ResultState): ResultState {
    if (props.variantId === state.variantId) {
      return { ...state, current: { ...state.current, content: props.children } };
    }
    return {
      variantId: props.variantId,
      current: { id: state.current.id + 1, content: props.children },
      outgoing: [...state.outgoing, state.current],
    };
  }

  componentDidMount() {
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced.addEventListener('change', this.onMotionChange);
  }

  getSnapshotBeforeUpdate(previous: ResultProps) {
    if (previous.variantId === this.props.variantId) return null;
    // Freeze every existing layer at its painted opacity. A second click then
    // blends from the current composite instead of snapping to the last target.
    return new Map(Array.from(this.root.current?.children ?? [], element => [
      element as HTMLElement, getComputedStyle(element).opacity,
    ]));
  }

  componentDidUpdate(_previous: ResultProps, _state: ResultState, snapshot: Map<HTMLElement, string> | null) {
    if (!snapshot) return;
    for (const [element, opacity] of snapshot) element.style.opacity = opacity;
    this.animation?.cancel();
    const incoming = this.root.current?.lastElementChild as HTMLElement | null;
    if (!incoming || this.reduced?.matches) {
      this.finish();
      return;
    }
    const animation = incoming.animate(crossfadeFrames, { duration: 320, easing: 'linear', fill: 'both' });
    this.animation = animation;
    void animation.finished.then(() => {
      if (this.animation === animation) this.finish();
    }, () => {});
  }

  componentWillUnmount() {
    this.animation?.cancel();
    this.reduced?.removeEventListener('change', this.onMotionChange);
  }

  private finish = () => {
    const incoming = this.root.current?.lastElementChild as HTMLElement | null;
    if (incoming) incoming.style.opacity = '1';
    this.animation?.cancel();
    this.animation = undefined;
    if (this.state.outgoing.length) this.setState({ outgoing: [] });
  };
  private onMotionChange = () => { if (this.reduced?.matches) this.finish(); };

  render() {
    const layers = [...this.state.outgoing, this.state.current];
    return <div ref={this.root} className="image-node-result-layers">
      {layers.map(layer => <div key={layer.id} className="image-node-result-layer"
        aria-hidden={layer.id === this.state.current.id ? undefined : true}>{layer.content}</div>)}
    </div>;
  }
}
