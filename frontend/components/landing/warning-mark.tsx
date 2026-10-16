interface Props {
  color: string;
  /** The "!" reads as a cut-out, so it takes the colour of whatever sits behind the mark. */
  markColor?: string;
}

const WarningMark = ({ color, markColor = "var(--color-surface-150)" }: Props) => (
  <svg aria-hidden="true" width="10" height="9.287" viewBox="0 0 10 9.28654" fill="none">
    <path
      d="M5 0c-.822 0-1.582.438-1.993 1.15L.31 5.78C-.586 7.334.535 9.287 2.33 9.287h5.34c1.795 0 2.916-1.953 2.02-3.507L6.993 1.15A2.302 2.302 0 0 0 5 0Z"
      fill={color}
    />
    <path
      d="m4.515 5.934-.2-2.916V1.712H5.69v1.306l-.2 2.916h-.975Zm.357 2.176c-.198 0-.357-.055-.479-.166a.58.58 0 0 1-.174-.443c0-.186.058-.334.174-.444.122-.11.281-.166.479-.166h.26c.198 0 .355.056.471.166.122.11.183.258.183.444a.58.58 0 0 1-.183.443c-.116.11-.276.166-.479.166h-.252Z"
      fill={markColor}
    />
  </svg>
);

export default WarningMark;
