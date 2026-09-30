function AttachmentCard({
  file,
  compact = false,
  onRemove,
  previewUrl,
}) {
  const [imageUrl, setImageUrl] = useState(previewUrl || null);

  useEffect(() => {
    if (!file || !file.type?.startsWith("image/")) {
      return;
    }

    if (previewUrl) {
      setImageUrl(previewUrl);
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, previewUrl]);

  const isImage =
    file?.type?.startsWith("image/") || Boolean(imageUrl);

  const size =
    file?.size
      ? file.size < 1024 * 1024
        ? `${Math.max(1, Math.round(file.size / 1024))} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : "";

  if (isImage && imageUrl) {
    return (
      <div
        style={{
          position: "relative",
          width: compact ? 120 : 180,
          height: compact ? 90 : 120,
          borderRadius: 12,
          overflow: "hidden",
          border: `1px solid ${theme.border}`,
          background: theme.surface,
          flexShrink: 0,
        }}
      >
        <img
          src={imageUrl}
          alt={file?.name || "Attached image"}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />

        {!compact && (
          <div
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              bottom: 6,
              padding: "5px 7px",
              borderRadius: 7,
              background: "rgba(0,0,0,0.65)",
              color: "#fff",
              fontSize: 11,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={file?.name}
          >
            {file?.name}
          </div>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 15,
              lineHeight: 1,
            }}
            aria-label={`Remove ${file?.name || "image"}`}
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: compact ? "7px 9px" : "9px 11px",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: theme.surface,
        minWidth: 0,
        maxWidth: compact ? 260 : 320,
      }}
    >
      <FileSpreadsheet
        size={compact ? 16 : 18}
        color={theme.textMuted}
        style={{ flexShrink: 0 }}
      />

      <div
        style={{
          minWidth: 0,
          flex: 1,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: theme.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={file?.name}
        >
          {file?.name || "Attachment"}
        </div>

        {size && (
          <div
            style={{
              fontSize: 10,
              color: theme.textMuted,
              marginTop: 2,
            }}
          >
            {size}
          </div>
        )}
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            width: 24,
            height: 24,
            border: "none",
            background: "transparent",
            color: theme.textMuted,
            cursor: "pointer",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-label={`Remove ${file?.name || "attachment"}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
