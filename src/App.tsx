import React, { useEffect, useRef, useState } from 'react';
import WebMidi from 'webmidi';
import _ from 'lodash';
import { MidiPort } from './components/ControlBar';
import { HarmonicMap, harmonicInfo, generateCorrections, noteToChannel } from './components/HarmonicMap';
import { Tuner } from './components/Tuner';

function MidiToNotes(midiNotes: { [key: number]: Note }): Notes {
  let notes: Notes = [];
  for (const note in midiNotes) {
    notes.push(midiNotes[note]);
  }
  return notes;
}

function usePrevious<t>(value: t): t | undefined {
  const ref = useRef<t>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}


// Using global variable as we need to read it outside of the React state
// lifecycle, always from the same reference, on the WebMidi listeners
let selectedOutput: string;

const App = () => {

  const [state, setState] = useState<AppState>({
    pressedKeys: {},
    selectedNotes: new Set(),
  })
  const [inputState, setInputState] = useState<InputState>({});
  const previousSelectedNotes = usePrevious(state.selectedNotes);

  const [webMidiStatus, setWebMidiStatus] = useState<WebMidiStatus>("initializing")

  useEffect(() => {

    WebMidi.enable((err) => {
      if (err) {
        console.log("WebMidi could not be enabled.", err);
        setWebMidiStatus("error");
      }
      else {
        console.log("WebMidi enabled!");
        setWebMidiStatus("initialized")
      }
    })

  }, [])


  const onSelectedInput = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    // Cleanup old input
    if (inputState.selected_input) {
      const oldInput = WebMidi.getInputById(inputState.selected_input);
      if (oldInput) {
        oldInput.removeListener('noteon');
        oldInput.removeListener('noteoff');
      }
    }

    const inputId = e.target.value;
    setInputState({
      ...inputState,
      selected_input: inputId,
    });
    const input = WebMidi.getInputById(inputId);

    // Listen for a 'note on' message on all channels
    if (input) {
      input.addListener('noteon', "all",
        (e) => {
          let pressedKeys = Object.assign(state.pressedKeys, { [e.note.number]: e.note.name as Note });
          setState({
            ...state,
            pressedKeys: pressedKeys
          });
        }
      );
      input.addListener('noteoff', "all",
        (e) => {
          const pressedKeys = Object.assign(state.pressedKeys);
          delete pressedKeys[e.note.number];
          setState({
            ...state,
            pressedKeys: pressedKeys
          });
        }
      );

      input.addListener('noteon', 'all', (event) => {
        let output = WebMidi.getOutputById(selectedOutput);
        if (output) {
          output.playNote(event.note.number, noteToChannel(event.note.number), { velocity: event.velocity });
        }
      });

      input.addListener('noteoff', 'all', (event) => {
        let output = WebMidi.getOutputById(selectedOutput);
        if (output) {
          output.stopNote(event.note.number, noteToChannel(event.note.number));
        }
      });
    }
  }

  const onSelectedOutput = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    // Cleanup old sounding notes in previous output
    let oldOutput = WebMidi.getOutputById(selectedOutput);
    oldOutput && oldOutput.sendStop();

    selectedOutput = e.target.value;
    sendTuning();
  }

  const sendTuning = () => {
    // Rely note to output
    let output = WebMidi.getOutputById(selectedOutput);
    if (output) {
      let corrections = generateCorrections(state.selectedNotes);
      for (const [midiNote, correction] of corrections.entries()) {
        output.sendPitchBend((correction ?? 0) / 100, noteToChannel(midiNote));
      }
    }
  }

  const onClickNote = (note: string) => {
    console.log(note);
    setState((state) => {
      let set = new Set(state.selectedNotes);
      if (set.has(note)) {
        set.delete(note);
      } else {
        set.add(note);
        let harmonicNote = harmonicInfo.find(info => note === info.uniqueName)
        harmonicInfo.forEach(({ uniqueName, midiNote }) => {
          if (midiNote === harmonicNote?.midiNote && note !== uniqueName) { set.delete(uniqueName); }
        });
      }
      return { ...state, selectedNotes: set }
    })
  }

  const pressedKeys = MidiToNotes(state.pressedKeys)

  if (webMidiStatus === "initialized" && !_.isEqual(previousSelectedNotes, state.selectedNotes)) {
    sendTuning();
  }

  return (
    <div className="App">
      <header className="App-header">
        Harmonic Map
      </header>
      <MidiPort
        onSelectedInput={onSelectedInput}
        onSelectedOutput={onSelectedOutput}
        webMidiStatus={webMidiStatus}
        selectedNotes={state.selectedNotes}
      />
      <HarmonicMap
        highlighted={pressedKeys}
        onClickNote={onClickNote}
        selected={state.selectedNotes} />
      <Tuner selected={state.selectedNotes} />
    </div>
  )

}

export default App
