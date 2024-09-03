import { Button, Drawer, Space } from "antd";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { rootDroppableId } from "../../../../lib/root-droppable-id";
import {
  ReplaceAction,
  SetAction,
  replaceAction,
  setAction,
} from "../../../../reducer";
import {
  ComponentData,
  RootData,
  UiState
} from "../../../../types/Config";
import type { Field, Fields as FieldsType } from "../../../../types/Fields";
import { AutoFieldPrivate } from "../../../AutoField";
import { Loader } from "../../../Loader";
import { useAppContext } from "../../context";

import { getClassNameFactory } from "../../../../lib";
import { getChanged } from "../../../../lib/get-changed";
import { getPermissions } from "../../../../lib/get-permissions";
import styles from "./styles.module.css";

const getClassName = getClassNameFactory("PuckFields", styles);

const defaultPageFields: Record<string, Field> = {
  title: { type: "text" },
};

const DefaultFields = ({
  children,
}: {
  children: React.ReactNode;
  isLoading: boolean;
  itemSelector?: any;
}) => {
  return <>{children}</>;
};

type ComponentOrRootData = Omit<Partial<ComponentData<any>>, "type">;

const useResolvedFields = (): [FieldsType, boolean] => {
  const { selectedItem, state, config } = useAppContext();

  const { data } = state;

  const rootFields = config.root?.fields || defaultPageFields;

  const componentConfig = selectedItem
    ? config.components[selectedItem.type]
    : null;

  const defaultFields = selectedItem
    ? (componentConfig?.fields as Record<string, Field<any>>)
    : rootFields;

  // DEPRECATED
  const rootProps = data.root.props || data.root;

  const [lastSelectedData, setLastSelectedData] = useState<ComponentOrRootData>(
    {}
  );
  const [resolvedFields, setResolvedFields] = useState(defaultFields || {});
  const [fieldsLoading, setFieldsLoading] = useState(false);

  const defaultResolveFields = (
    _componentData: ComponentOrRootData,
    _params: {
      fields: FieldsType;
      lastData: ComponentOrRootData;
      lastFields: FieldsType;
      changed: Record<string, boolean>;
    }
  ) => defaultFields;

  const componentData: ComponentOrRootData = selectedItem
    ? selectedItem
    : { props: rootProps, readOnly: data.root.readOnly };

  const resolveFields = useCallback(
    async (fields: FieldsType = {}) => {
      const lastData =
        lastSelectedData.props?.id === componentData.props.id
          ? lastSelectedData
          : {};

      const changed = getChanged(componentData, lastData);

      setLastSelectedData(componentData);

      if (selectedItem && componentConfig?.resolveFields) {
        return await componentConfig?.resolveFields(
          componentData as ComponentData,
          {
            changed,
            fields,
            lastFields: resolvedFields,
            lastData: lastData as ComponentData,
            appState: state,
          }
        );
      }

      if (!selectedItem && config.root?.resolveFields) {
        return await config.root?.resolveFields(componentData, {
          changed,
          fields,
          lastFields: resolvedFields,
          lastData: lastData as RootData,
          appState: state,
        });
      }

      return defaultResolveFields(componentData, {
        changed,
        fields,
        lastFields: resolvedFields,
        lastData,
      });
    },
    [data, config, componentData, selectedItem, resolvedFields, state]
  );

  useEffect(() => {
    setFieldsLoading(true);

    resolveFields(defaultFields).then((fields) => {
      setResolvedFields(fields || {});

      setFieldsLoading(false);
    });
  }, [data, defaultFields]);

  return [resolvedFields, fieldsLoading];
};

export const Fields = () => {
  const {
    selectedItem,
    state,
    dispatch,
    config,
    resolveData,
    componentState,
    overrides,
    globalPermissions,
  } = useAppContext();
  const { data, ui } = state;
  const { itemSelector } = ui;

  const [fields, fieldsResolving] = useResolvedFields();

  const componentResolving = selectedItem
    ? componentState[selectedItem?.props.id]?.loading
    : componentState["puck-root"]?.loading;

  const isLoading = fieldsResolving || componentResolving;

  // DEPRECATED
  const rootProps = data.root.props || data.root;

  const Wrapper = useMemo(() => overrides.fields || DefaultFields, [overrides]);
  const [open, setOpen] = useState(false);
  const [currentField, setCurrentField] = useState<string | null>(null);

  const showDrawer = (fieldName: string) => {
    setCurrentField(fieldName);
    setOpen(true);
  };

  const onClose = () => {
    setOpen(false);
  };

  return (
    <form
      className={getClassName()}
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <Wrapper isLoading={isLoading} itemSelector={itemSelector}>
        <div
          className="button-row"
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            padding: "8px",
          }}
        >
          {Object.keys(fields).map((fieldName) => (
            <Space key={fieldName}>
              <Button
                size="large"
                onClick={() => showDrawer(fieldName)}
                className="gradient-button"
              >
                {fieldName}
              </Button>
            </Space>
          ))}
        </div>

        <Drawer
          title={currentField}
          placement="bottom"
          closable
          onClose={onClose}
          open={open}
          key="bottom"
          height={"auto"}
          mask={false}
        >
          {currentField && (
            <div className="modal-content">
              {Object.keys(fields).map((fieldName) => {
                const field = fields[fieldName];

                if (fieldName !== currentField || !field?.type) return null;
                const onChange = (value: any, updatedUi?: Partial<UiState>) => {
                  let currentProps;

                  if (selectedItem) {
                    currentProps = selectedItem.props;
                  } else {
                    currentProps = rootProps;
                  }

                  const newProps = {
                    ...currentProps,
                    [fieldName]: value,
                  };

                  if (itemSelector) {
                    const replaceActionData: ReplaceAction = {
                      type: "replace",
                      destinationIndex: itemSelector.index,
                      destinationZone: itemSelector.zone || rootDroppableId,
                      data: { ...selectedItem, props: newProps },
                    };

                    // We use `replace` action, then feed into `set` action so we can also process any UI changes
                    const replacedData = replaceAction(data, replaceActionData);

                    const setActionData: SetAction = {
                      type: "set",
                      state: {
                        data: { ...data, ...replacedData },
                        ui: { ...ui, ...updatedUi },
                      },
                    };

                    // If the component has a resolveData method, we let resolveData run and handle the dispatch once it's done
                    if (config.components[selectedItem!.type]?.resolveData) {
                      resolveData(setAction(state, setActionData));
                    } else {
                      dispatch({
                        ...setActionData,
                        recordHistory: true,
                      });
                    }
                  } else {
                    if (data.root.props) {
                      // If the component has a resolveData method, we let resolveData run and handle the dispatch once it's done
                      if (config.root?.resolveData) {
                        resolveData({
                          ui: { ...ui, ...updatedUi },
                          data: {
                            ...data,
                            root: { props: newProps },
                          },
                        });
                      } else {
                        dispatch({
                          type: "set",
                          state: {
                            ui: { ...ui, ...updatedUi },
                            data: {
                              ...data,
                              root: { props: newProps },
                            },
                          },
                          recordHistory: true,
                        });
                      }
                    } else {
                      // DEPRECATED
                      dispatch({
                        type: "setData",
                        data: { root: newProps },
                      });
                    }
                  }
                };

                if (selectedItem && itemSelector) {
                  const { readOnly = {} } = selectedItem;
                  const { edit } = getPermissions({
                    selectedItem,
                    config,
                    globalPermissions: globalPermissions || {},
                    appState: state,
                  });

                  return (
                    <div key={`${selectedItem.props.id}_${fieldName}`}>
                      <AutoFieldPrivate
                        key={`${selectedItem.props.id}_${fieldName}`}
                        field={field}
                        name={fieldName}
                        id={`${selectedItem.props.id}_${fieldName}`}
                        readOnly={!edit || readOnly[fieldName]}
                        value={selectedItem.props[fieldName]}
                        onChange={onChange}
                      />
                    </div>
                  );
                } else {
                  const { readOnly = {} } = data.root;

                  return (
                    <div key={`page_${fieldName}`}>
                      <AutoFieldPrivate
                        key={`page_${fieldName}`}
                        field={field}
                        name={fieldName}
                        id={`root_${fieldName}`}
                        readOnly={readOnly[fieldName]}
                        value={rootProps[fieldName]}
                        onChange={onChange}
                      />
                    </div>
                  );
                }
              })}
            </div>
          )}
        </Drawer>
      </Wrapper>
      {isLoading && (
        <div className={getClassName("loadingOverlay")}>
          <div className={getClassName("loadingOverlayInner")}>
            <Loader size={16} />
          </div>
        </div>
      )}
    </form>
  );
};
