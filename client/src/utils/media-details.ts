import type { ImageExifData } from '../types/api';

export function formatExifDetails(exif: ImageExifData | null | undefined, t: (key: string) => string) {
    if (!exif) {
      return []
    }

    const details: Array<{ label: string; value: string }> = []
    const location = formatLocation(
      exif.latitude,
      exif.longitude,
      exif.altitudeMeters,
    )
    const camera = formatCameraLabel(exif.cameraMake, exif.cameraModel)
    const aperture =
      typeof exif.fNumber === "number" && Number.isFinite(exif.fNumber)
        ? `f/${formatExifNumber(exif.fNumber, 2)}`
        : null
    const shutter = formatExposureTime(exif.exposureTimeSeconds)
    const iso =
      typeof exif.iso === "number" && Number.isFinite(exif.iso)
        ? formatExifNumber(exif.iso, 0)
        : null
    const focalLength = formatFocalLength(
      exif.focalLengthMm,
      exif.focalLength35mmMm,
    )

    if (location) {
      details.push({
        label: t('post.viewer.metadata.location'),
        value: location,
      })
    }

    if (camera) {
      details.push({
        label: t('post.viewer.metadata.camera'),
        value: camera,
      })
    }

    if (exif.lensModel) {
      details.push({
        label: t('post.viewer.metadata.lens'),
        value: exif.lensModel,
      })
    }

    if (aperture) {
      details.push({
        label: t('post.viewer.metadata.aperture'),
        value: aperture,
      })
    }

    if (shutter) {
      details.push({
        label: t('post.viewer.metadata.shutter'),
        value: shutter,
      })
    }

    if (iso) {
      details.push({
        label: t('post.viewer.metadata.iso'),
        value: iso,
      })
    }

    if (focalLength) {
      details.push({
        label: t('post.viewer.metadata.focalLength'),
        value: focalLength,
      })
    }

    return details
}

  function formatExifNumber(
    value: number | null | undefined,
    maximumFractionDigits = 1,
  ) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null
    }

    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits,
    }).format(value)
  }

  function formatCameraLabel(
    make: string | null | undefined,
    model: string | null | undefined,
  ) {
    if (make && model) {
      return model.toLowerCase().startsWith(make.toLowerCase())
        ? model
        : `${make} ${model}`
    }

    return make ?? model ?? null
  }

  function formatExposureTime(seconds: number | null | undefined) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
      return null
    }

    if (seconds >= 1) {
      return `${formatExifNumber(seconds, seconds >= 10 ? 0 : 1)} s`
    }

    const reciprocal = Math.round(1 / seconds)
    if (
      reciprocal > 1 &&
      Math.abs(1 / reciprocal - seconds) <= Math.max(seconds * 0.08, 0.0005)
    ) {
      return `1/${reciprocal} s`
    }

    return `${formatExifNumber(seconds, 3)} s`
  }

  function formatFocalLength(
    focalLengthMm: number | null | undefined,
    focalLength35mmMm: number | null | undefined,
  ) {
    const focalLength = formatExifNumber(focalLengthMm, 2)
    const focalLength35mm = formatExifNumber(focalLength35mmMm, 0)

    if (focalLength && focalLength35mm) {
      return `${focalLength} mm (${focalLength35mm} mm equiv.)`
    }

    if (focalLength) {
      return `${focalLength} mm`
    }

    if (focalLength35mm) {
      return `${focalLength35mm} mm equiv.`
    }

    return null
  }

  function formatLocation(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
    altitudeMeters: number | null | undefined,
  ) {
    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      typeof longitude !== "number" ||
      !Number.isFinite(longitude)
    ) {
      return null
    }

    const coordinates = `${formatExifNumber(latitude, 5)}, ${formatExifNumber(
      longitude,
      5,
    )}`
    const altitude = formatExifNumber(altitudeMeters, 1)

    return altitude ? `${coordinates} (alt ${altitude} m)` : coordinates
  }
